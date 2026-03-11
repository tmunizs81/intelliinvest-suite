import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Transaction {
  id: string;
  ticker: string;
  name: string;
  type: string;
  operation: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fees: number;
  date: string;
  is_daytrade: boolean;
  notes: string | null;
}

export interface MonthlyTaxSummary {
  month: string; // YYYY-MM
  label: string;
  salesTotal: number;
  exempt: boolean;
  exemptionLimit: number;
  gains: TaxGainByType[];
  totalTax: number;
  darfDueDate: string;
  lossCarryForward: number;
}

export interface TaxGainByType {
  type: string;
  grossGain: number;
  deductibleLoss: number;
  netGain: number;
  taxRate: number;
  tax: number;
  operations: SellOperation[];
}

export interface SellOperation {
  ticker: string;
  date: string;
  quantity: number;
  sellPrice: number;
  avgCost: number;
  gain: number;
  fees: number;
  isDaytrade: boolean;
}

// Brazilian tax rules
const TAX_RULES: Record<string, { rate: number; daytradeRate: number; exemptionLimit: number; darfCode: string }> = {
  'Ação':       { rate: 0.15, daytradeRate: 0.20, exemptionLimit: 20000, darfCode: '6015' },
  'FII':        { rate: 0.20, daytradeRate: 0.20, exemptionLimit: 0,     darfCode: '6015' },
  'ETF':        { rate: 0.15, daytradeRate: 0.20, exemptionLimit: 0,     darfCode: '6015' },
  'Cripto':     { rate: 0.15, daytradeRate: 0.15, exemptionLimit: 35000, darfCode: '4600' },
  'Renda Fixa': { rate: 0.15, daytradeRate: 0.15, exemptionLimit: 0,     darfCode: '6015' },
};

function getLastBusinessDay(year: number, month: number): string {
  // DARF due date: last business day of month following the sale
  const nextMonth = month + 1;
  const y = nextMonth > 12 ? year + 1 : year;
  const m = nextMonth > 12 ? 1 : nextMonth;
  const lastDay = new Date(y, m, 0);
  // Back up from weekends
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay.toISOString().split('T')[0];
}

export function useTaxes() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setTransactions((data || []) as Transaction[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>) => {
    if (!user) return;
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      ticker: tx.ticker.toUpperCase(),
      name: tx.name,
      type: tx.type,
      operation: tx.operation,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      fees: tx.fees,
      date: tx.date,
      is_daytrade: tx.is_daytrade,
      notes: tx.notes,
    });
    if (error) throw error;
    await loadTransactions();
  }, [user, loadTransactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id);
    await loadTransactions();
  }, [user, loadTransactions]);

  // Calculate taxes
  const calculateTaxes = useCallback((year: number): MonthlyTaxSummary[] => {
    const yearTxs = transactions.filter(t => t.date.startsWith(String(year)));
    if (yearTxs.length === 0) return [];

    // Build running avg cost per ticker
    const avgCosts: Record<string, { totalCost: number; totalQty: number }> = {};
    const allTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    // Loss carry forward per type
    const lossCarry: Record<string, number> = {};

    const monthlyMap: Record<string, { sells: SellOperation[]; salesByType: Record<string, number> }> = {};

    for (const tx of allTxs) {
      if (!avgCosts[tx.ticker]) avgCosts[tx.ticker] = { totalCost: 0, totalQty: 0 };

      if (tx.operation === 'buy') {
        avgCosts[tx.ticker].totalCost += tx.price * tx.quantity + tx.fees;
        avgCosts[tx.ticker].totalQty += tx.quantity;
      } else if (tx.operation === 'sell') {
        const avg = avgCosts[tx.ticker].totalQty > 0
          ? avgCosts[tx.ticker].totalCost / avgCosts[tx.ticker].totalQty
          : 0;
        const gain = (tx.price * tx.quantity - tx.fees) - (avg * tx.quantity);

        const month = tx.date.slice(0, 7);

        // Only process sells in the requested year
        if (tx.date.startsWith(String(year))) {
          if (!monthlyMap[month]) monthlyMap[month] = { sells: [], salesByType: {} };
          monthlyMap[month].sells.push({
            ticker: tx.ticker,
            date: tx.date,
            quantity: tx.quantity,
            sellPrice: tx.price,
            avgCost: avg,
            gain,
            fees: tx.fees,
            isDaytrade: tx.is_daytrade,
          });
          monthlyMap[month].salesByType[tx.type] = (monthlyMap[month].salesByType[tx.type] || 0) + tx.price * tx.quantity;
        }

        // Update position
        avgCosts[tx.ticker].totalQty -= tx.quantity;
        avgCosts[tx.ticker].totalCost = avg * Math.max(0, avgCosts[tx.ticker].totalQty);
      }
    }

    // Build monthly summaries
    const summaries: MonthlyTaxSummary[] = [];
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      return `${year}-${m}`;
    });

    for (const month of months) {
      const data = monthlyMap[month];
      if (!data || data.sells.length === 0) continue;

      const [y, m] = month.split('-').map(Number);
      const monthLabel = new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      // Group by type
      const byType: Record<string, SellOperation[]> = {};
      for (const sell of data.sells) {
        // Find type from transactions
        const origTx = transactions.find(t => t.ticker === sell.ticker);
        const type = origTx?.type || 'Ação';
        if (!byType[type]) byType[type] = [];
        byType[type].push(sell);
      }

      const gains: TaxGainByType[] = [];
      let totalTax = 0;

      for (const [type, ops] of Object.entries(byType)) {
        const rules = TAX_RULES[type] || TAX_RULES['Ação'];
        const salesTotal = data.salesByType[type] || 0;
        const grossGain = ops.reduce((s, o) => s + o.gain, 0);

        // Check exemption (only for stocks/crypto based on total sales in month)
        const isExempt = rules.exemptionLimit > 0 && salesTotal <= rules.exemptionLimit && !ops.some(o => o.isDaytrade);

        if (isExempt) {
          gains.push({
            type, grossGain, deductibleLoss: 0, netGain: grossGain,
            taxRate: 0, tax: 0, operations: ops,
          });
          continue;
        }

        // Apply loss carry forward
        if (!lossCarry[type]) lossCarry[type] = 0;
        let netGain = grossGain + lossCarry[type]; // lossCarry is negative

        let deductibleLoss = 0;
        if (grossGain > 0 && lossCarry[type] < 0) {
          deductibleLoss = Math.min(grossGain, Math.abs(lossCarry[type]));
          lossCarry[type] += deductibleLoss;
        } else if (grossGain < 0) {
          lossCarry[type] += grossGain;
          netGain = 0;
        }

        const hasDaytrade = ops.some(o => o.isDaytrade);
        const rate = hasDaytrade ? rules.daytradeRate : rules.rate;
        const tax = netGain > 0 ? netGain * rate : 0;
        totalTax += tax;

        gains.push({
          type, grossGain, deductibleLoss, netGain: Math.max(0, netGain),
          taxRate: rate, tax, operations: ops,
        });
      }

      const salesTotal = Object.values(data.salesByType).reduce((s, v) => s + v, 0);
      const anyExempt = gains.some(g => g.taxRate === 0 && g.grossGain > 0);

      summaries.push({
        month,
        label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        salesTotal,
        exempt: anyExempt,
        exemptionLimit: 20000,
        gains,
        totalTax,
        darfDueDate: getLastBusinessDay(y, m),
        lossCarryForward: Object.values(lossCarry).reduce((s, v) => s + Math.min(0, v), 0),
      });
    }

    return summaries;
  }, [transactions]);

  // Annual summary for declaration
  const getAnnualSummary = useCallback((year: number) => {
    const monthly = calculateTaxes(year);
    const totalTax = monthly.reduce((s, m) => s + m.totalTax, 0);
    const totalGains = monthly.reduce((s, m) => s + m.gains.reduce((g, t) => g + t.grossGain, 0), 0);
    const totalSales = monthly.reduce((s, m) => s + m.salesTotal, 0);
    const taxPaidMonths = monthly.filter(m => m.totalTax > 0).length;

    return { monthly, totalTax, totalGains, totalSales, taxPaidMonths, year };
  }, [calculateTaxes]);

  return {
    transactions, loading, error,
    addTransaction, deleteTransaction, loadTransactions,
    calculateTaxes, getAnnualSummary,
  };
}

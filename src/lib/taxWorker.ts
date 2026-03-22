/**
 * Web Worker for heavy tax calculations.
 * Runs calculateTaxes off the main thread.
 */

interface WorkerTransaction {
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

const TAX_RULES: Record<string, { rate: number; daytradeRate: number; exemptionLimit: number }> = {
  'Ação':       { rate: 0.15, daytradeRate: 0.20, exemptionLimit: 20000 },
  'FII':        { rate: 0.20, daytradeRate: 0.20, exemptionLimit: 0 },
  'ETF':        { rate: 0.15, daytradeRate: 0.20, exemptionLimit: 0 },
  'Cripto':     { rate: 0.15, daytradeRate: 0.15, exemptionLimit: 35000 },
  'Renda Fixa': { rate: 0.15, daytradeRate: 0.15, exemptionLimit: 0 },
};

function getLastBusinessDay(year: number, month: number): string {
  const nextMonth = month + 1;
  const y = nextMonth > 12 ? year + 1 : year;
  const m = nextMonth > 12 ? 1 : nextMonth;
  const lastDay = new Date(y, m, 0);
  while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay.toISOString().split('T')[0];
}

function calculateTaxes(transactions: WorkerTransaction[], year: number) {
  const yearTxs = transactions.filter(t => t.date.startsWith(String(year)));
  if (yearTxs.length === 0) return [];

  const avgCosts: Record<string, { totalCost: number; totalQty: number }> = {};
  const allTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const lossCarry: Record<string, number> = {};
  const monthlyMap: Record<string, { sells: any[]; salesByType: Record<string, number> }> = {};

  for (const tx of allTxs) {
    if (!avgCosts[tx.ticker]) avgCosts[tx.ticker] = { totalCost: 0, totalQty: 0 };

    if (tx.operation === 'buy') {
      avgCosts[tx.ticker].totalCost += tx.price * tx.quantity + tx.fees;
      avgCosts[tx.ticker].totalQty += tx.quantity;
    } else if (tx.operation === 'sell') {
      const avg = avgCosts[tx.ticker].totalQty > 0
        ? avgCosts[tx.ticker].totalCost / avgCosts[tx.ticker].totalQty : 0;
      const gain = (tx.price * tx.quantity - tx.fees) - (avg * tx.quantity);
      const month = tx.date.slice(0, 7);

      if (tx.date.startsWith(String(year))) {
        if (!monthlyMap[month]) monthlyMap[month] = { sells: [], salesByType: {} };
        monthlyMap[month].sells.push({
          ticker: tx.ticker, date: tx.date, quantity: tx.quantity,
          sellPrice: tx.price, avgCost: avg, gain, fees: tx.fees, isDaytrade: tx.is_daytrade,
        });
        monthlyMap[month].salesByType[tx.type] = (monthlyMap[month].salesByType[tx.type] || 0) + tx.price * tx.quantity;
      }

      avgCosts[tx.ticker].totalQty -= tx.quantity;
      avgCosts[tx.ticker].totalCost = avg * Math.max(0, avgCosts[tx.ticker].totalQty);
    }
  }

  const summaries: any[] = [];
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  for (const month of months) {
    const data = monthlyMap[month];
    if (!data || data.sells.length === 0) continue;

    const [y, m] = month.split('-').map(Number);
    const byType: Record<string, any[]> = {};
    for (const sell of data.sells) {
      const origTx = transactions.find(t => t.ticker === sell.ticker);
      const type = origTx?.type || 'Ação';
      if (!byType[type]) byType[type] = [];
      byType[type].push(sell);
    }

    const gains: any[] = [];
    let totalTax = 0;

    for (const [type, ops] of Object.entries(byType)) {
      const rules = TAX_RULES[type] || TAX_RULES['Ação'];
      const salesTotal = data.salesByType[type] || 0;
      const grossGain = ops.reduce((s: number, o: any) => s + o.gain, 0);
      const isExempt = rules.exemptionLimit > 0 && salesTotal <= rules.exemptionLimit && !ops.some((o: any) => o.isDaytrade);

      if (isExempt) {
        gains.push({ type, grossGain, deductibleLoss: 0, netGain: grossGain, taxRate: 0, tax: 0, operations: ops });
        continue;
      }

      if (!lossCarry[type]) lossCarry[type] = 0;
      let netGain = grossGain + lossCarry[type];
      let deductibleLoss = 0;

      if (grossGain > 0 && lossCarry[type] < 0) {
        deductibleLoss = Math.min(grossGain, Math.abs(lossCarry[type]));
        lossCarry[type] += deductibleLoss;
      } else if (grossGain < 0) {
        lossCarry[type] += grossGain;
        netGain = 0;
      }

      const hasDaytrade = ops.some((o: any) => o.isDaytrade);
      const rate = hasDaytrade ? rules.daytradeRate : rules.rate;
      const tax = netGain > 0 ? netGain * rate : 0;
      totalTax += tax;

      gains.push({ type, grossGain, deductibleLoss, netGain: Math.max(0, netGain), taxRate: rate, tax, operations: ops });
    }

    const salesTotal = Object.values(data.salesByType).reduce((s, v) => s + v, 0);
    summaries.push({
      month,
      label: new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      salesTotal,
      exempt: gains.some(g => g.taxRate === 0 && g.grossGain > 0),
      exemptionLimit: 20000,
      gains,
      totalTax,
      darfDueDate: getLastBusinessDay(y, m),
      lossCarryForward: Object.values(lossCarry).reduce((s, v) => s + Math.min(0, v), 0),
    });
  }

  return summaries;
}

// Worker message handler
self.onmessage = (e: MessageEvent) => {
  const { type, transactions, year } = e.data;
  if (type === 'calculateTaxes') {
    const result = calculateTaxes(transactions, year);
    self.postMessage({ type: 'taxResult', result });
  }
};

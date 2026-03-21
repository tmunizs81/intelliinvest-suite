import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { type Asset } from '@/lib/mockData';
import { classifyAssetType } from '@/lib/assetClassification';
import { calculateFixedIncomeValue, fetchReferenceRates } from '@/lib/fixedIncomeCalculator';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface HoldingRow {
  id: string;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  avg_price: number;
  sector: string | null;
  broker: string | null;
}

export interface CashBalanceRow {
  id: string;
  broker: string | null;
  balance: number;
}

export function usePortfolio() {
  const { user } = useAuth();
  const { log: auditLog } = useAuditLog();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [cashBalances, setCashBalances] = useState<CashBalanceRow[]>([]);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [nextUpdate, setNextUpdate] = useState<Date | null>(null);

  // Load cash balance
  const loadCashBalance = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cash_balance' as any)
      .select('id, balance, broker')
      .eq('user_id', user.id);
    const rows = ((data as any[]) || []).map((r: any) => ({ id: r.id, broker: r.broker, balance: Number(r.balance) }));
    setCashBalances(rows);
    setCashBalance(rows.reduce((s: number, r: CashBalanceRow) => s + r.balance, 0));
  }, [user]);

  // Load holdings from DB
  const loadHoldings = useCallback(async () => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('holdings')
      .select('*, yield_rate, indexer_type, maturity_date, property_purpose, rental_value')
      .eq('user_id', user.id);
    if (error) {
      console.error('Error loading holdings:', error);
      return [];
    }
    setHoldings(data || []);
    return data || [];
  }, [user]);

  // Fetch quotes from Yahoo Finance
  const fetchQuotes = useCallback(async (holdingsData?: HoldingRow[]) => {
    const h = holdingsData || holdings;
    if (h.length === 0) {
      setAssets([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // Separate fixed income, real estate, and market assets
      const fixedIncomeHoldings = h.filter(item => item.type === 'Renda Fixa');
      const propertyHoldings = h.filter(item => item.type === 'Imóvel');
      const marketHoldings = h.filter(item => item.type !== 'Renda Fixa' && item.type !== 'Imóvel');

      let quotes: Record<string, any> = {};

      // Only call Yahoo Finance for market assets
      if (marketHoldings.length > 0) {
        const tickers = marketHoldings.map((item) => item.ticker);
        const { data, error: fnError } = await supabase.functions.invoke('yahoo-finance', {
          body: { tickers },
        });
        if (fnError) throw new Error(fnError.message || 'Failed to fetch quotes');
        quotes = data.quotes || {};
      }

      let totalValue = 0;

      // Enrich market assets
      const marketEnriched = marketHoldings.map((item) => {
        const quote = quotes[item.ticker];
        const currency = quote?.currency || 'BRL';
        const originalPrice = quote?.currentPrice || 0;
        const currentPriceBRL = quote?.currentPriceBRL || originalPrice;
        const exchangeRate = quote?.exchangeRate || 1;
        const value = currentPriceBRL * item.quantity;
        totalValue += value;
        return {
          ticker: item.ticker,
          name: item.name,
          type: classifyAssetType(item.ticker, item.type) as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice: currentPriceBRL,
          change24h: quote?.change24h || 0,
          allocation: 0,
          sector: item.sector || undefined,
          source: quote?.source || undefined,
          currency,
          currentPriceBRL,
          exchangeRate,
          originalPrice,
        };
      });

      // Calculate fixed income values locally
      const fixedEnriched = fixedIncomeHoldings.map((item) => {
        const investedAmount = item.avg_price * item.quantity;
        const result = calculateFixedIncomeValue({
          investedAmount,
          yieldRate: (item as any).yield_rate || null,
          indexerType: (item as any).indexer_type || null,
          purchaseDate: (item as any).created_at || new Date().toISOString(),
          maturityDate: (item as any).maturity_date || null,
        });
        const currentPricePerUnit = item.quantity > 0 ? result.currentValue / item.quantity : item.avg_price;
        totalValue += result.currentValue;
        return {
          ticker: item.ticker,
          name: item.name,
          type: 'Renda Fixa' as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice: currentPricePerUnit,
          change24h: result.grossReturnPct,
          allocation: 0,
          sector: item.sector || undefined,
          source: 'calculated' as string,
          currency: 'BRL',
          currentPriceBRL: currentPricePerUnit,
          exchangeRate: 1,
          originalPrice: currentPricePerUnit,
        };
      });

      // Calculate real estate values locally (appreciation + rental ROI)
      const propertyEnriched = propertyHoldings.map((item) => {
        const investedAmount = item.avg_price * item.quantity;
        const yieldRateStr = (item as any).yield_rate || '0';
        const period = (item as any).indexer_type || 'anual';
        const rateNum = parseFloat(yieldRateStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const rentalValueMonthly = parseFloat((item as any).rental_value) || 0;
        const purpose = (item as any).property_purpose || 'holding';
        
        // Convert to annual rate
        const annualRate = period === 'mensal' ? (Math.pow(1 + rateNum / 100, 12) - 1) * 100 : rateNum;
        
        // Calculate elapsed months
        const start = new Date((item as any).created_at || new Date().toISOString());
        const now = new Date();
        const elapsedMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + (now.getDate() - start.getDate()) / 30;
        
        // Property appreciation
        const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
        const appreciatedValue = investedAmount * Math.pow(1 + monthlyRate, Math.max(0, elapsedMonths));
        
        // Rental income accumulated
        const totalRentalIncome = purpose === 'aluguel' ? rentalValueMonthly * Math.max(0, elapsedMonths) : 0;
        
        // Total return = appreciation + rental income
        const currentValue = appreciatedValue;
        const totalReturn = (appreciatedValue - investedAmount) + totalRentalIncome;
        const totalReturnPct = investedAmount > 0 ? (totalReturn / investedAmount) * 100 : 0;
        
        // Monthly ROI for rental
        const monthlyROI = purpose === 'aluguel' && investedAmount > 0 ? (rentalValueMonthly / investedAmount) * 100 : 0;
        const annualROI = purpose === 'aluguel' && investedAmount > 0 ? ((rentalValueMonthly * 12) / investedAmount) * 100 : 0;
        
        const currentPricePerUnit = item.quantity > 0 ? currentValue / item.quantity : item.avg_price;
        totalValue += currentValue;
        return {
          ticker: item.ticker,
          name: item.name,
          type: 'Imóvel' as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice: currentPricePerUnit,
          change24h: totalReturnPct,
          allocation: 0,
          sector: item.sector ? `${item.sector}${purpose === 'aluguel' ? ` • Aluguel R$${rentalValueMonthly.toLocaleString('pt-BR')}/mês • ROI ${monthlyROI.toFixed(2)}%/mês (${annualROI.toFixed(1)}%/ano)` : ' • Patrimônio'}` : undefined,
          source: 'calculated' as string,
          currency: 'BRL',
          currentPriceBRL: currentPricePerUnit,
          exchangeRate: 1,
          originalPrice: currentPricePerUnit,
        };
      });

      const allEnriched = [...marketEnriched, ...fixedEnriched, ...propertyEnriched];

      const assetsWithAllocation: Asset[] = allEnriched.map((a) => ({
        ...a,
        allocation: totalValue > 0 ? Math.round(((a.currentPrice * a.quantity) / totalValue) * 1000) / 10 : 0,
      }));

      setAssets(assetsWithAllocation);
      const now = new Date();
      setLastUpdate(now);
      setNextUpdate(new Date(now.getTime() + POLL_INTERVAL));
      setLoading(false);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar cotações');
      setLoading(false);
    }
  }, [holdings]);

  // Initial load
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    const init = async () => {
      // Fetch live BCB rates (Selic, CDI, IPCA) before calculating fixed income
      await fetchReferenceRates().catch(() => {});
      const h = await loadHoldings();
      await loadCashBalance();
      if (h.length > 0) {
        await fetchQuotes(h);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [user, loadHoldings, loadCashBalance]);

  // Polling every 5 minutes
  useEffect(() => {
    if (!user || holdings.length === 0) return;
    const interval = setInterval(() => fetchQuotes(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user, holdings, fetchQuotes]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const h = await loadHoldings();
    await loadCashBalance();
    await fetchQuotes(h);
  }, [loadHoldings, loadCashBalance, fetchQuotes]);

  // CRUD operations
  const addHolding = useCallback(async (holding: Omit<HoldingRow, 'id'>) => {
    if (!user) return;
    const { error } = await supabase.from('holdings').insert({
      user_id: user.id,
      ticker: holding.ticker.toUpperCase(),
      name: holding.name,
      type: holding.type,
      quantity: holding.quantity,
      avg_price: holding.avg_price,
      sector: holding.sector,
      broker: holding.broker || null,
      ...((holding as any).yield_rate && { yield_rate: (holding as any).yield_rate }),
      ...((holding as any).indexer_type && { indexer_type: (holding as any).indexer_type }),
      ...((holding as any).maturity_date && { maturity_date: (holding as any).maturity_date }),
    } as any);
    if (error) throw error;

    await supabase.from('transactions').insert({
      user_id: user.id,
      ticker: holding.ticker.toUpperCase(),
      name: holding.name,
      type: holding.type,
      operation: 'buy',
      quantity: holding.quantity,
      price: holding.avg_price,
      total: holding.quantity * holding.avg_price,
      fees: 0,
      date: new Date().toISOString().split('T')[0],
      is_daytrade: false,
      notes: 'Lançamento automático via Meus Ativos',
    });

    await auditLog('buy', 'holding', holding.ticker.toUpperCase(), {
      ticker: holding.ticker.toUpperCase(), quantity: holding.quantity, price: holding.avg_price,
    });
    await refresh();
  }, [user, refresh, auditLog]);

  const updateHolding = useCallback(async (id: string, updates: Partial<HoldingRow>) => {
    if (!user) return;
    const { error } = await supabase.from('holdings').update({
      ...(updates.ticker && { ticker: updates.ticker.toUpperCase() }),
      ...(updates.name && { name: updates.name }),
      ...(updates.type && { type: updates.type }),
      ...(updates.quantity !== undefined && { quantity: updates.quantity }),
      ...(updates.avg_price !== undefined && { avg_price: updates.avg_price }),
      ...(updates.sector !== undefined && { sector: updates.sector }),
      ...(updates.broker !== undefined && { broker: updates.broker }),
      ...((updates as any).yield_rate !== undefined && { yield_rate: (updates as any).yield_rate }),
      ...((updates as any).indexer_type !== undefined && { indexer_type: (updates as any).indexer_type }),
      ...((updates as any).maturity_date !== undefined && { maturity_date: (updates as any).maturity_date }),
    } as any).eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    await refresh();
  }, [user, refresh]);

  const deleteHolding = useCallback(async (id: string) => {
    if (!user) return;
    const holding = holdings.find(h => h.id === id);
    const { error } = await supabase.from('holdings').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    await auditLog('delete', 'holding', id, { ticker: holding?.ticker });
    await refresh();
  }, [user, refresh, holdings, auditLog]);

  const sellHolding = useCallback(async (holdingId: string, sellQty: number, sellPrice: number, fees: number = 0) => {
    if (!user) return;
    
    const holding = holdings.find(h => h.id === holdingId);
    if (!holding) throw new Error('Ativo não encontrado');
    if (sellQty > holding.quantity) throw new Error('Quantidade insuficiente');

    const sellTotal = sellQty * sellPrice;
    const netTotal = sellTotal - fees;

    await supabase.from('transactions').insert({
      user_id: user.id,
      ticker: holding.ticker,
      name: holding.name,
      type: holding.type,
      operation: 'sell',
      quantity: sellQty,
      price: sellPrice,
      total: sellTotal,
      fees,
      date: new Date().toISOString().split('T')[0],
      is_daytrade: false,
      notes: 'Venda registrada via Meus Ativos',
    });

    const remainingQty = holding.quantity - sellQty;
    if (remainingQty <= 0) {
      await supabase.from('holdings').delete().eq('id', holdingId).eq('user_id', user.id);
    } else {
      await supabase.from('holdings').update({ quantity: remainingQty } as any).eq('id', holdingId).eq('user_id', user.id);
    }

    const holdingBroker = holding.broker || '';
    const { data: existing } = await supabase
      .from('cash_balance' as any)
      .select('id, balance')
      .eq('user_id', user.id)
      .eq('broker', holdingBroker)
      .maybeSingle();

    if (existing) {
      await supabase.from('cash_balance' as any).update({
        balance: (existing as any).balance + netTotal,
        updated_at: new Date().toISOString(),
      } as any).eq('id', (existing as any).id);
    } else {
      await supabase.from('cash_balance' as any).insert({
        user_id: user.id,
        balance: netTotal,
        broker: holdingBroker || null,
      } as any);
    }

    await supabase.from('cash_movements' as any).insert({
      user_id: user.id,
      type: 'sell',
      amount: netTotal,
      broker: holding.broker || null,
      description: `Venda de ${sellQty}x ${holding.ticker} a ${sellPrice.toFixed(2)}`,
    } as any);

    await auditLog('sell', 'holding', holdingId, {
      ticker: holding.ticker, quantity: sellQty, price: sellPrice, total: sellTotal,
    });
    await refresh();
  }, [user, holdings, refresh, auditLog]);

  const updateCashBalanceBroker = useCallback(async (amount: number, broker: string | null, movementType?: 'deposit' | 'withdraw', movementAmount?: number) => {
    if (!user) return;
    const brokerVal = broker || '';
    const { data: existing } = await supabase
      .from('cash_balance' as any)
      .select('id')
      .eq('user_id', user.id)
      .eq('broker', brokerVal)
      .maybeSingle();

    if (existing) {
      await supabase.from('cash_balance' as any).update({ balance: amount, updated_at: new Date().toISOString() } as any).eq('id', (existing as any).id);
    } else {
      await supabase.from('cash_balance' as any).insert({ user_id: user.id, balance: amount, broker: broker || null } as any);
    }

    if (movementType && movementAmount) {
      await supabase.from('cash_movements' as any).insert({
        user_id: user.id,
        type: movementType,
        amount: movementAmount,
        broker: broker || null,
        description: movementType === 'deposit' ? `Depósito em ${broker || 'caixa'}` : `Saque de ${broker || 'caixa'}`,
      } as any);
    }

    await loadCashBalance();
  }, [user, loadCashBalance]);

  const loadCashMovements = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from('cash_movements' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    return (data as any[]) || [];
  }, [user]);

  return { assets, holdings, cashBalance, cashBalances, loading, error, lastUpdate, nextUpdate, refresh, addHolding, updateHolding, deleteHolding, sellHolding, updateCashBalance: updateCashBalanceBroker, loadCashMovements };
}

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { type Asset } from '@/lib/mockData';

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes

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
      .select('*')
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
      const tickers = h.map((item) => item.ticker);
      const { data, error: fnError } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to fetch quotes');

      const quotes = data.quotes || {};
      let totalValue = 0;

      const enriched = h.map((item) => {
        const quote = quotes[item.ticker];
        const currency = quote?.currency || 'BRL';
        const currentPrice = quote?.currentPrice || 0;
        const currentPriceBRL = quote?.currentPriceBRL || currentPrice;
        const exchangeRate = quote?.exchangeRate || 1;
        const value = currentPriceBRL * item.quantity;
        totalValue += value;
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice: currentPriceBRL, // Use BRL price for portfolio calculations
          change24h: quote?.change24h || 0,
          allocation: 0,
          sector: item.sector || undefined,
          source: quote?.source || undefined,
          currency,
          currentPriceBRL,
          exchangeRate,
        };
      });

      const assetsWithAllocation: Asset[] = enriched.map((a) => ({
        ...a,
        allocation: totalValue > 0 ? Math.round(((a.currentPrice * a.quantity) / totalValue) * 1000) / 10 : 0,
      }));

      setAssets(assetsWithAllocation);
      setLastUpdate(new Date());
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

  // Polling
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

    // Auto-create buy transaction for tax tracking
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

  // Sell holding (partial or full)
  const sellHolding = useCallback(async (holdingId: string, sellQty: number, sellPrice: number, fees: number = 0) => {
    if (!user) return;
    
    const holding = holdings.find(h => h.id === holdingId);
    if (!holding) throw new Error('Ativo não encontrado');
    if (sellQty > holding.quantity) throw new Error('Quantidade insuficiente');

    const sellTotal = sellQty * sellPrice;
    const netTotal = sellTotal - fees;

    // Record sell transaction
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

    // Update or delete holding
    const remainingQty = holding.quantity - sellQty;
    if (remainingQty <= 0) {
      await supabase.from('holdings').delete().eq('id', holdingId).eq('user_id', user.id);
    } else {
      await supabase.from('holdings').update({ quantity: remainingQty } as any).eq('id', holdingId).eq('user_id', user.id);
    }

    // Update cash balance (use holding's broker)
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

    // Record cash movement for sell
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

  // Update cash balance for a specific broker
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

    // Record cash movement
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

  // Load cash movements
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

  return { assets, holdings, cashBalance, cashBalances, loading, error, lastUpdate, refresh, addHolding, updateHolding, deleteHolding, sellHolding, updateCashBalance: updateCashBalanceBroker, loadCashMovements };
}

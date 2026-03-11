import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type Asset } from '@/lib/mockData';

const POLL_INTERVAL = 10 * 60 * 1000;

export interface HoldingRow {
  id: string;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  avg_price: number;
  sector: string | null;
}

export function usePortfolio() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
        const currentPrice = quote?.currentPrice || 0;
        const value = currentPrice * item.quantity;
        totalValue += value;
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice,
          change24h: quote?.change24h || 0,
          allocation: 0,
          sector: item.sector || undefined,
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
      if (h.length > 0) {
        await fetchQuotes(h);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [user, loadHoldings]);

  // Polling
  useEffect(() => {
    if (!user || holdings.length === 0) return;
    const interval = setInterval(() => fetchQuotes(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user, holdings, fetchQuotes]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const h = await loadHoldings();
    await fetchQuotes(h);
  }, [loadHoldings, fetchQuotes]);

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
    });
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

    await refresh();
  }, [user, refresh]);

  const updateHolding = useCallback(async (id: string, updates: Partial<HoldingRow>) => {
    if (!user) return;
    const { error } = await supabase.from('holdings').update({
      ...(updates.ticker && { ticker: updates.ticker.toUpperCase() }),
      ...(updates.name && { name: updates.name }),
      ...(updates.type && { type: updates.type }),
      ...(updates.quantity !== undefined && { quantity: updates.quantity }),
      ...(updates.avg_price !== undefined && { avg_price: updates.avg_price }),
      ...(updates.sector !== undefined && { sector: updates.sector }),
    }).eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    await refresh();
  }, [user, refresh]);

  const deleteHolding = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('holdings').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    await refresh();
  }, [user, refresh]);

  return { assets, holdings, loading, error, lastUpdate, refresh, addHolding, updateHolding, deleteHolding };
}

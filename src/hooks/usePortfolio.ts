import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';

const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Holdings the user owns (static for now - will come from DB later)
export const userHoldings: Omit<Asset, 'currentPrice' | 'change24h'>[] = [
  { ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação', quantity: 500, avgPrice: 28.50, allocation: 0, sector: 'Petróleo' },
  { ticker: 'VALE3', name: 'Vale ON', type: 'Ação', quantity: 300, avgPrice: 62.30, allocation: 0, sector: 'Mineração' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'Ação', quantity: 400, avgPrice: 25.10, allocation: 0, sector: 'Bancos' },
  { ticker: 'HGLG11', name: 'CSHG Logística', type: 'FII', quantity: 80, avgPrice: 158.00, allocation: 0, sector: 'Logística' },
  { ticker: 'XPML11', name: 'XP Malls', type: 'FII', quantity: 120, avgPrice: 95.50, allocation: 0, sector: 'Shopping' },
  { ticker: 'BTC', name: 'Bitcoin', type: 'Cripto', quantity: 0.15, avgPrice: 180000, allocation: 0, sector: 'Cripto' },
  { ticker: 'IVVB11', name: 'iShares S&P 500', type: 'ETF', quantity: 200, avgPrice: 280.00, allocation: 0, sector: 'Internacional' },
  { ticker: 'WEGE3', name: 'WEG ON', type: 'Ação', quantity: 150, avgPrice: 35.20, allocation: 0, sector: 'Indústria' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'Ação', quantity: 250, avgPrice: 42.00, allocation: 0, sector: 'Bancos' },
];

interface QuoteData {
  currentPrice: number;
  change24h: number;
  previousClose: number;
  name: string;
  error?: string;
}

export function usePortfolio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchQuotes = useCallback(async () => {
    try {
      setError(null);
      const tickers = userHoldings.map((h) => h.ticker);

      const { data, error: fnError } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch quotes');
      }

      const quotes: Record<string, QuoteData> = data.quotes;

      // Calculate total portfolio value for allocation
      let totalValue = 0;
      const enriched = userHoldings.map((h) => {
        const quote = quotes[h.ticker];
        const currentPrice = quote?.currentPrice || 0;
        const value = currentPrice * h.quantity;
        totalValue += value;
        return { ...h, currentPrice, change24h: quote?.change24h || 0, value };
      });

      // Set allocation percentages
      const assetsWithAllocation: Asset[] = enriched.map((a) => ({
        ...a,
        allocation: totalValue > 0 ? Math.round((a.value / totalValue) * 1000) / 10 : 0,
      }));

      setAssets(assetsWithAllocation);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar cotações');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    intervalRef.current = setInterval(fetchQuotes, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQuotes]);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetchQuotes();
  }, [fetchQuotes]);

  return { assets, loading, error, lastUpdate, refresh };
}

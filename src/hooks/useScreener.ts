import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { captureError } from '@/lib/observability';

export interface ScreenerFilter {
  type: 'stock' | 'fii';
  minDY?: number;
  maxPL?: number;
  minROE?: number;
  maxPVP?: number;
  minMarketCap?: number;
  sector?: string;
  limit?: number;
}

export interface ScreenerResult {
  ticker: string;
  name: string;
  price: number;
  dy: number;
  pl: number;
  pvp: number;
  roe: number;
  marketCap: number;
  sector: string;
  score: number;
}

export function useScreener() {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (filter: ScreenerFilter) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('asset-screener', { body: filter });
      if (error) throw error;
      setResults(data?.results || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      captureError(err, { context: 'screener', filter });
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, run };
}

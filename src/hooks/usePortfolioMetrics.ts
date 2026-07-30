import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCached, setCache, CACHE_TTL } from "@/lib/persistentCache";

export interface PortfolioMetrics {
  user_id: string;
  metric_date: string;
  total_invested: number;
  total_positions: number;
  distinct_tickers: number;
  by_type: Record<string, number>;
  by_broker: Record<string, number>;
  by_sector: Record<string, number>;
  top_holdings: Array<{
    ticker: string;
    name: string | null;
    type: string | null;
    broker: string | null;
    quantity: number;
    avg_price: number;
    invested: number;
  }>;
  updated_at: string;
}

const CACHE_PREFIX = "portfolio_metrics:";

/**
 * Lê métricas pré-agregadas server-side (portfolio_daily_metrics) com
 * Stale-While-Revalidate: cache do IndexedDB pinta na hora, RPC revalida
 * em background. Elimina 200-500ms do primeiro paint.
 */
export function usePortfolioMetrics() {
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const fetchMetrics = useCallback(async (force = false) => {
    if (inflight.current && !force) return inflight.current;

    const run = (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { setLoading(false); return; }

        const cacheKey = `${CACHE_PREFIX}${uid}`;

        if (!force) {
          const cached = await getCached<PortfolioMetrics>(cacheKey);
          if (cached) {
            setMetrics(cached);
            setLoading(false);
          }
        }

        let { data, error: qErr } = await (supabase as any)
          .from("portfolio_daily_metrics")
          .select("*")
          .eq("user_id", uid)
          .order("metric_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (qErr) throw qErr;

        if (!data) {
          await (supabase as any).rpc("refresh_my_portfolio_metrics");
          const retry = await (supabase as any)
            .from("portfolio_daily_metrics")
            .select("*")
            .eq("user_id", uid)
            .order("metric_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          data = retry.data;
        }

        setMetrics(data as PortfolioMetrics | null);
        setError(null);
        if (data) await setCache(cacheKey, data, CACHE_TTL.SNAPSHOTS);
      } catch (e: any) {
        setError(e.message || "Erro ao carregar métricas");
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();

    inflight.current = run;
    return run;
  }, []);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    await (supabase as any).rpc("refresh_my_portfolio_metrics");
    await fetchMetrics(true);
  }, [fetchMetrics]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { metrics, loading, error, refresh };
}

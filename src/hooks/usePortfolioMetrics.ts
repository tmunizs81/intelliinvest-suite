import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Reads server-side pre-aggregated portfolio metrics (Fase 3).
 * Falls back to triggering a refresh if today's row is missing.
 */
export function usePortfolioMetrics() {
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      let { data, error: qErr } = await (supabase as any)
        .from("portfolio_daily_metrics")
        .select("*")
        .eq("user_id", uid)
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (qErr) throw qErr;

      // If empty, trigger a refresh and retry
      if (!data) {
        await (supabase as any).rpc("refresh_portfolio_metrics", { _user_id: uid });
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
    } catch (e: any) {
      setError(e.message || "Erro ao carregar métricas");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    await (supabase as any).rpc("refresh_portfolio_metrics", { _user_id: uid });
    await fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, error, refresh };
}

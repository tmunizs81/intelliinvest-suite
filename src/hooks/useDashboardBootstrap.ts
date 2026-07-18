/**
 * useDashboardBootstrap — Stale-While-Revalidate hook que traz TODOS os dados
 * iniciais da dashboard em uma única RPC (`get_dashboard_bootstrap`).
 *
 * Fluxo:
 * 1. Lê cache do IndexedDB → paint imediato (stale)
 * 2. Dispara RPC em background → revalida
 * 3. Atualiza estado + regrava cache
 *
 * Reduz o cold-start da dashboard de ~6 requests paralelas para 1.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCached, setCache, CACHE_TTL } from "@/lib/persistentCache";
import type { PortfolioMetrics } from "./usePortfolioMetrics";

export interface DashboardBootstrap {
  metrics: PortfolioMetrics | null;
  holdings: any[];
  snapshots: Array<{
    snapshot_date: string;
    total_value: number;
    total_cost: number;
    assets_count: number;
  }>;
  cash: any[];
  alerts: any[];
  generated_at: string;
}

const CACHE_PREFIX = "dashboard_bootstrap:";

export function useDashboardBootstrap() {
  const [data, setData] = useState<DashboardBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (force = false) => {
    if (inflight.current && !force) return inflight.current;

    const run = (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { setLoading(false); return; }

        const cacheKey = `${CACHE_PREFIX}${uid}`;

        // 1) SWR: paint stale cache
        if (!force) {
          const cached = await getCached<DashboardBootstrap>(cacheKey);
          if (cached) {
            setData(cached);
            setFromCache(true);
            setLoading(false);
          }
        }

        setRevalidating(true);
        const { data: fresh, error: rpcErr } = await (supabase as any)
          .rpc("get_dashboard_bootstrap");

        if (rpcErr) throw rpcErr;

        setData(fresh as DashboardBootstrap);
        setFromCache(false);
        setError(null);
        await setCache(cacheKey, fresh, CACHE_TTL.SNAPSHOTS); // 1h
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar dashboard");
      } finally {
        setLoading(false);
        setRevalidating(false);
        inflight.current = null;
      }
    })();

    inflight.current = run;
    return run;
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, revalidating, error, fromCache, refresh: () => load(true) };
}

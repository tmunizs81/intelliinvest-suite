/**
 * usePriceRefreshWorker — Rotina de atualização quase em tempo real.
 *
 * A cada 10 minutos (e imediatamente ao voltar o foco / reconectar):
 *  1. Refaz o fetch de cotações (usePortfolio.refresh)
 *  2. Persiste um snapshot intraday (portfolio_snapshots)
 *  3. Invalida o cache do bootstrap para revalidar em próximas montagens
 *
 * Pausa quando a aba está oculta (evita gastar tokens/CPU) e retoma no focus.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { clearCache } from '@/lib/persistentCache';
import type { Asset } from '@/lib/mockData';

const INTERVAL_MS = 10 * 60 * 1000;

interface Params {
  assets: Asset[];
  loading: boolean;
  refresh: () => Promise<void> | void;
  saveSnapshot: (assets: Asset[]) => Promise<void>;
}

export function usePriceRefreshWorker({ assets, loading, refresh, saveSnapshot }: Params) {
  const { user } = useAuth();
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    const tick = async () => {
      if (runningRef.current) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastRunRef.current < 60 * 1000) return; // debounce 1min
      runningRef.current = true;
      try {
        await refresh();
        if (assets.length > 0) await saveSnapshot(assets);
        await clearCache(`dashboard_bootstrap:${user.id}`);
        lastRunRef.current = Date.now();
      } catch (e) {
        console.warn('[PriceWorker] refresh failed:', e);
      } finally {
        runningRef.current = false;
      }
    };

    const start = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(tick, INTERVAL_MS);
    };

    start();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunRef.current > INTERVAL_MS) {
        tick();
      }
    };
    const onOnline = () => tick();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    // Persist snapshot as soon as first fresh load completes
    if (!loading && assets.length > 0 && lastRunRef.current === 0) {
      lastRunRef.current = Date.now();
      saveSnapshot(assets).catch(() => {});
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [user, refresh, saveSnapshot, assets, loading]);
}

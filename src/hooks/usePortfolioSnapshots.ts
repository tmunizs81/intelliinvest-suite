import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { type Asset } from '@/lib/mockData';

export interface SnapshotRow {
  snapshot_date: string;
  total_value: number;
  total_cost: number;
  assets_count: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function usePortfolioSnapshots() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const loadSnapshots = useCallback(async (force = false) => {
    if (!user) return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < CACHE_TTL && snapshots.length > 0) return;
    setLoading(true);
    const { data } = await supabase
      .from('portfolio_snapshots' as any)
      .select('snapshot_date, total_value, total_cost, assets_count')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
      .limit(365);
    setSnapshots(
      ((data as any[]) || []).map((r: any) => ({
        snapshot_date: r.snapshot_date,
        total_value: Number(r.total_value),
        total_cost: Number(r.total_cost),
        assets_count: Number(r.assets_count),
      }))
    );
    lastFetchRef.current = Date.now();
    setLoading(false);
  }, [user, snapshots.length]);

  const saveSnapshot = useCallback(async (assets: Asset[]) => {
    if (!user || assets.length === 0) return;
    const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    const totalCost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('portfolio_snapshots' as any)
      .select('id')
      .eq('user_id', user.id)
      .eq('snapshot_date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('portfolio_snapshots' as any)
        .update({ total_value: totalValue, total_cost: totalCost, assets_count: assets.length } as any)
        .eq('id', (existing as any).id);
    } else {
      await supabase.from('portfolio_snapshots' as any).insert({
        user_id: user.id, total_value: totalValue, total_cost: totalCost,
        assets_count: assets.length, snapshot_date: today,
      } as any);
    }
  }, [user]);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  return {
    snapshots, loading,
    loadSnapshots: () => loadSnapshots(true),
    saveSnapshot,
  };
}

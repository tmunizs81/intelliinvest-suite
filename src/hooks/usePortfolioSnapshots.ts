import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { type Asset } from '@/lib/mockData';

export interface SnapshotRow {
  snapshot_date: string;
  total_value: number;
  total_cost: number;
  assets_count: number;
}

export function usePortfolioSnapshots() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSnapshots = useCallback(async () => {
    if (!user) return;
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
    setLoading(false);
  }, [user]);

  // Save today's snapshot (upsert)
  const saveSnapshot = useCallback(async (assets: Asset[]) => {
    if (!user || assets.length === 0) return;
    const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    const totalCost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
    const today = new Date().toISOString().split('T')[0];

    // Check if already exists today
    const { data: existing } = await supabase
      .from('portfolio_snapshots' as any)
      .select('id')
      .eq('user_id', user.id)
      .eq('snapshot_date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('portfolio_snapshots' as any)
        .update({
          total_value: totalValue,
          total_cost: totalCost,
          assets_count: assets.length,
        } as any)
        .eq('id', (existing as any).id);
    } else {
      await supabase.from('portfolio_snapshots' as any).insert({
        user_id: user.id,
        total_value: totalValue,
        total_cost: totalCost,
        assets_count: assets.length,
        snapshot_date: today,
      } as any);
    }
  }, [user]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  return { snapshots, loading, loadSnapshots, saveSnapshot };
}

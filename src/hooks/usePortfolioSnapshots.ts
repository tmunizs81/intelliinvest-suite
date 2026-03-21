import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const { data: snapshots = [], isLoading: loading } = useQuery({
    queryKey: ['portfolio-snapshots', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('portfolio_snapshots' as any)
        .select('snapshot_date, total_value, total_cost, assets_count')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: true })
        .limit(365);
      return ((data as any[]) || []).map((r: any) => ({
        snapshot_date: r.snapshot_date,
        total_value: Number(r.total_value),
        total_cost: Number(r.total_cost),
        assets_count: Number(r.assets_count),
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const loadSnapshots = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['portfolio-snapshots', user?.id] });
  }, [queryClient, user?.id]);

  // Save today's snapshot (upsert)
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

  return { snapshots, loading, loadSnapshots, saveSnapshot };
}

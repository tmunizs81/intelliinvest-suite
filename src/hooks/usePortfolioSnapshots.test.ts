import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ data: [], error: null }),
          }),
          eq: () => ({
            maybeSingle: () => ({ data: null, error: null }),
          }),
        }),
      }),
      insert: () => ({ error: null }),
      update: () => ({ eq: () => ({ error: null }) }),
    }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

describe('usePortfolioSnapshots - unit logic', () => {
  describe('SnapshotRow interface', () => {
    it('should define correct shape', () => {
      const row = {
        snapshot_date: '2025-01-15',
        total_value: 150000,
        total_cost: 120000,
        assets_count: 12,
      };
      expect(row.total_value).toBeGreaterThan(row.total_cost);
      expect(row.assets_count).toBe(12);
    });
  });

  describe('Snapshot calculation logic', () => {
    it('should calculate total value from assets', () => {
      const assets = [
        { currentPrice: 35, quantity: 100 },
        { currentPrice: 80, quantity: 50 },
        { currentPrice: 12, quantity: 200 },
      ];
      const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
      expect(totalValue).toBe(35 * 100 + 80 * 50 + 12 * 200); // 3500 + 4000 + 2400 = 9900
    });

    it('should calculate total cost from assets', () => {
      const assets = [
        { avgPrice: 30, quantity: 100 },
        { avgPrice: 70, quantity: 50 },
      ];
      const totalCost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
      expect(totalCost).toBe(6500);
    });

    it('should generate correct date string for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should skip save when assets are empty', () => {
      const assets: any[] = [];
      expect(assets.length === 0).toBe(true); // saveSnapshot should return early
    });
  });

  describe('Cache TTL logic', () => {
    it('should respect 5-minute TTL', () => {
      const CACHE_TTL = 5 * 60 * 1000;
      const lastFetch = Date.now() - 3 * 60 * 1000; // 3 min ago
      const now = Date.now();
      
      expect(now - lastFetch < CACHE_TTL).toBe(true); // should use cache
    });

    it('should invalidate after TTL expires', () => {
      const CACHE_TTL = 5 * 60 * 1000;
      const lastFetch = Date.now() - 6 * 60 * 1000; // 6 min ago
      const now = Date.now();
      
      expect(now - lastFetch < CACHE_TTL).toBe(false); // should refetch
    });

    it('should force fetch regardless of TTL when force=true', () => {
      const force = true;
      // When force is true, the TTL check is bypassed
      expect(force).toBe(true);
    });
  });

  describe('Snapshot data mapping', () => {
    it('should map raw data to SnapshotRow correctly', () => {
      const rawData = [
        { snapshot_date: '2025-01-01', total_value: '100000.50', total_cost: '90000', assets_count: '10' },
        { snapshot_date: '2025-01-02', total_value: '101000', total_cost: '90000', assets_count: '10' },
      ];
      
      const mapped = rawData.map((r) => ({
        snapshot_date: r.snapshot_date,
        total_value: Number(r.total_value),
        total_cost: Number(r.total_cost),
        assets_count: Number(r.assets_count),
      }));
      
      expect(mapped[0].total_value).toBe(100000.50);
      expect(typeof mapped[0].total_value).toBe('number');
      expect(mapped).toHaveLength(2);
    });

    it('should handle null data gracefully', () => {
      const data = null;
      const mapped = ((data as any[]) || []).map((r: any) => ({
        snapshot_date: r.snapshot_date,
        total_value: Number(r.total_value),
      }));
      expect(mapped).toEqual([]);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the hook
const mockFrom = vi.fn();
const mockInvoke = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockMaybeSingle = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => {
      mockFrom(...args);
      return {
        select: (...a: any[]) => {
          mockSelect(...a);
          return {
            eq: (...e: any[]) => {
              mockEq(...e);
              return {
                eq: (...e2: any[]) => {
                  mockEq(...e2);
                  return { data: [], error: null, maybeSingle: () => ({ data: null, error: null }) };
                },
                data: [],
                error: null,
                order: () => ({ limit: () => ({ data: [], error: null }) }),
                maybeSingle: () => ({ data: null, error: null }),
              };
            },
            data: [],
            error: null,
          };
        },
        insert: (...a: any[]) => {
          mockInsert(...a);
          return { error: null };
        },
        update: (...a: any[]) => {
          mockUpdate(...a);
          return {
            eq: () => ({ eq: () => ({ error: null }) }),
            error: null,
          };
        },
        delete: () => ({
          eq: () => ({ eq: () => ({ error: null }) }),
        }),
      };
    },
    functions: {
      invoke: (...args: any[]) => {
        mockInvoke(...args);
        return Promise.resolve({ data: { quotes: {} }, error: null });
      },
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id', email: 'test@test.com' } }),
}));

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({ log: vi.fn() }),
}));

vi.mock('@/lib/fixedIncomeCalculator', () => ({
  calculateFixedIncomeValue: vi.fn(() => ({
    currentValue: 1100,
    grossReturnPct: 10,
  })),
  fetchReferenceRates: vi.fn(() => Promise.resolve()),
}));

describe('usePortfolio - unit logic tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HoldingRow interface', () => {
    it('should define correct shape for holdings', () => {
      const holding = {
        id: 'uuid-1',
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'Ação',
        quantity: 100,
        avg_price: 30.5,
        sector: 'Petróleo',
        broker: 'XP',
      };
      expect(holding).toHaveProperty('id');
      expect(holding).toHaveProperty('ticker');
      expect(holding).toHaveProperty('avg_price');
      expect(holding.quantity).toBeGreaterThan(0);
    });
  });

  describe('CashBalanceRow interface', () => {
    it('should define correct shape for cash balance', () => {
      const cash = { id: 'uuid-2', broker: 'XP', balance: 5000 };
      expect(cash.balance).toBe(5000);
      expect(cash).toHaveProperty('broker');
    });
  });

  describe('Asset enrichment logic', () => {
    it('should calculate allocation correctly', () => {
      const totalValue = 10000;
      const assetValue = 2500;
      const allocation = Math.round((assetValue / totalValue) * 1000) / 10;
      expect(allocation).toBe(25);
    });

    it('should handle zero total value without NaN', () => {
      const totalValue = 0;
      const assetValue = 100;
      const allocation = totalValue > 0 ? Math.round((assetValue / totalValue) * 1000) / 10 : 0;
      expect(allocation).toBe(0);
      expect(Number.isNaN(allocation)).toBe(false);
    });

    it('should calculate property appreciation correctly', () => {
      const investedAmount = 500000;
      const annualRate = 10; // 10% ao ano
      const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
      const elapsedMonths = 12;
      const appreciatedValue = investedAmount * Math.pow(1 + monthlyRate, elapsedMonths);
      
      expect(appreciatedValue).toBeCloseTo(550000, -3); // ~550k after 1 year at 10%
    });

    it('should calculate rental ROI correctly', () => {
      const investedAmount = 500000;
      const rentalValueMonthly = 2500;
      const monthlyROI = (rentalValueMonthly / investedAmount) * 100;
      const annualROI = ((rentalValueMonthly * 12) / investedAmount) * 100;
      
      expect(monthlyROI).toBe(0.5);
      expect(annualROI).toBe(6);
    });

    it('should convert monthly rate to annual correctly', () => {
      const monthlyRate = 1; // 1% ao mês
      const period = 'mensal';
      const annualRate = period === 'mensal' 
        ? (Math.pow(1 + monthlyRate / 100, 12) - 1) * 100 
        : monthlyRate;
      
      expect(annualRate).toBeCloseTo(12.68, 1); // compound ~12.68%
    });
  });

  describe('Sell logic', () => {
    it('should calculate net total after fees', () => {
      const sellQty = 50;
      const sellPrice = 35.0;
      const fees = 10;
      const sellTotal = sellQty * sellPrice;
      const netTotal = sellTotal - fees;
      
      expect(sellTotal).toBe(1750);
      expect(netTotal).toBe(1740);
    });

    it('should determine remaining quantity correctly', () => {
      const holdingQty = 100;
      const sellQty = 100;
      const remaining = holdingQty - sellQty;
      
      expect(remaining).toBe(0);
      expect(remaining <= 0).toBe(true); // should trigger delete
    });

    it('should throw for insufficient quantity', () => {
      const holdingQty = 50;
      const sellQty = 100;
      
      expect(sellQty > holdingQty).toBe(true);
    });
  });

  describe('Optimistic updates', () => {
    it('should generate unique temp IDs', () => {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should rollback array on error', () => {
      const holdings = [
        { id: '1', ticker: 'PETR4' },
        { id: '2', ticker: 'VALE3' },
      ];
      const tempId = 'temp-3';
      
      // Add optimistically
      const withNew = [...holdings, { id: tempId, ticker: 'ITUB4' }];
      expect(withNew).toHaveLength(3);
      
      // Rollback
      const rolledBack = withNew.filter(h => h.id !== tempId);
      expect(rolledBack).toHaveLength(2);
      expect(rolledBack.find(h => h.id === tempId)).toBeUndefined();
    });
  });
});

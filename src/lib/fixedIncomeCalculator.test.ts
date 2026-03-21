import { describe, it, expect } from 'vitest';
import { calculateFixedIncomeValue, formatYieldDescription } from '@/lib/fixedIncomeCalculator';

describe('fixedIncomeCalculator', () => {
  describe('calculateFixedIncomeValue', () => {
    it('returns zeros for zero investment', () => {
      const result = calculateFixedIncomeValue({
        investedAmount: 0,
        yieldRate: '100%',
        indexerType: 'CDI',
        purchaseDate: '2024-01-01',
      });
      expect(result.currentValue).toBe(0);
      expect(result.grossReturn).toBe(0);
      expect(result.grossReturnPct).toBe(0);
    });

    it('calculates pre-fixed income correctly', () => {
      const result = calculateFixedIncomeValue({
        investedAmount: 10000,
        yieldRate: '12',
        indexerType: 'Pré-fixado',
        purchaseDate: '2024-01-01',
      });
      expect(result.currentValue).toBeGreaterThan(10000);
      expect(result.annualRate).toBe(12);
      expect(result.grossReturn).toBeGreaterThan(0);
      expect(result.grossReturnPct).toBeGreaterThan(0);
      expect(result.elapsedDays).toBeGreaterThan(0);
    });

    it('calculates CDI-based income', () => {
      const result = calculateFixedIncomeValue({
        investedAmount: 50000,
        yieldRate: '110',
        indexerType: 'CDI',
        purchaseDate: '2024-06-01',
      });
      expect(result.currentValue).toBeGreaterThan(50000);
      expect(result.annualRate).toBeGreaterThan(0);
      expect(result.dailyRate).toBeGreaterThan(0);
    });

    it('calculates IPCA+ income', () => {
      const result = calculateFixedIncomeValue({
        investedAmount: 20000,
        yieldRate: '6',
        indexerType: 'IPCA+',
        purchaseDate: '2024-03-15',
      });
      expect(result.currentValue).toBeGreaterThan(20000);
      // IPCA+ should be IPCA rate + spread
      expect(result.annualRate).toBeGreaterThan(6);
    });

    it('handles null yield rate with defaults', () => {
      const result = calculateFixedIncomeValue({
        investedAmount: 10000,
        yieldRate: null,
        indexerType: 'Pós-fixado',
        purchaseDate: '2024-01-01',
      });
      expect(result.currentValue).toBeGreaterThan(10000);
    });

    it('handles future purchase date gracefully', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const result = calculateFixedIncomeValue({
        investedAmount: 10000,
        yieldRate: '12',
        indexerType: 'Pré-fixado',
        purchaseDate: futureDate.toISOString().split('T')[0],
      });
      expect(result.elapsedDays).toBe(0);
      expect(result.currentValue).toBe(10000);
    });
  });

  describe('formatYieldDescription', () => {
    it('returns yield rate when present', () => {
      expect(formatYieldDescription('CDI', '110% CDI')).toBe('110% CDI');
    });

    it('returns indexer type when yield rate is null', () => {
      expect(formatYieldDescription('Pré-fixado', null)).toBe('Pré-fixado');
    });

    it('returns default when both are null', () => {
      expect(formatYieldDescription(null, null)).toBe('Pós-fixado');
    });
  });
});

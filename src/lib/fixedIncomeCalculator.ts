/**
 * Fixed Income Return Calculator
 * Calculates estimated current value for Brazilian fixed income assets
 * based on indexer type, yield rate, and elapsed time.
 * Fetches live Selic/CDI/IPCA rates daily from the Brazilian Central Bank.
 */

import { supabase } from '@/integrations/supabase/client';

// Fallback rates (used if API is unavailable)
const FALLBACK_RATES = {
  CDI: 14.15,
  SELIC: 14.25,
  IPCA: 5.0,
};

// Module-level cache
let _cachedRates: { CDI: number; SELIC: number; IPCA: number } | null = null;
let _cacheTimestamp = 0;
const LOCAL_CACHE_KEY = 'simplynvest_bcb_rates';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Get live reference rates, with localStorage + memory cache
 */
export async function fetchReferenceRates(): Promise<{ CDI: number; SELIC: number; IPCA: number }> {
  const now = Date.now();

  // 1. Memory cache
  if (_cachedRates && (now - _cacheTimestamp) < CACHE_TTL) {
    return _cachedRates;
  }

  // 2. localStorage cache
  try {
    const stored = localStorage.getItem(LOCAL_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.timestamp && (now - parsed.timestamp) < CACHE_TTL) {
        _cachedRates = parsed.rates;
        _cacheTimestamp = parsed.timestamp;
        return parsed.rates;
      }
    }
  } catch { /* ignore */ }

  // 3. Fetch from edge function
  try {
    const { data, error } = await supabase.functions.invoke('bcb-rates');
    if (!error && data?.rates) {
      const rates = {
        CDI: data.rates.cdi ?? FALLBACK_RATES.CDI,
        SELIC: data.rates.selic ?? FALLBACK_RATES.SELIC,
        IPCA: data.rates.ipca ?? FALLBACK_RATES.IPCA,
      };
      _cachedRates = rates;
      _cacheTimestamp = now;
      try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ rates, timestamp: now }));
      } catch { /* ignore */ }
      return rates;
    }
  } catch (err) {
    console.warn('Failed to fetch BCB rates, using fallback:', err);
  }

  // 4. Fallback
  return FALLBACK_RATES;
}

/**
 * Synchronous version using cached rates (for rendering)
 */
export function getReferenceRates(): { CDI: number; SELIC: number; IPCA: number } {
  if (_cachedRates) return _cachedRates;

  // Try localStorage
  try {
    const stored = localStorage.getItem(LOCAL_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.rates) {
        _cachedRates = parsed.rates;
        _cacheTimestamp = parsed.timestamp || 0;
        return parsed.rates;
      }
    }
  } catch { /* ignore */ }

  return FALLBACK_RATES;
}

interface FixedIncomeParams {
  investedAmount: number;
  yieldRate: string | null;
  indexerType: string | null;
  purchaseDate: string;
  maturityDate?: string | null;
}

/**
 * Parse yield rate string to extract numeric value
 */
function parseYieldRate(yieldRate: string): number {
  if (!yieldRate) return 100;
  const cleaned = yieldRate.replace(/[^\d.,%-]/g, ' ').trim();
  const match = cleaned.match(/([\d]+[.,]?[\d]*)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return 100;
}

/**
 * Calculate the annualized rate for a fixed income asset
 */
function getAnnualRate(indexerType: string | null, yieldRate: string | null): number {
  const rates = getReferenceRates();
  const rate = yieldRate ? parseYieldRate(yieldRate) : 100;
  const indexer = (indexerType || 'Pós-fixado').trim();

  switch (indexer) {
    case 'Pré-fixado':
      return rate;
    case 'Pós-fixado':
    case 'CDI':
      return (rate / 100) * rates.CDI;
    case 'CDI+':
      return rates.CDI + rate;
    case 'IPCA+':
      return rates.IPCA + rate;
    case 'Selic':
      return (rate / 100) * rates.SELIC;
    default:
      return (rate / 100) * rates.CDI;
  }
}

/**
 * Calculate estimated current value of a fixed income asset
 */
export function calculateFixedIncomeValue(params: FixedIncomeParams): {
  currentValue: number;
  grossReturn: number;
  grossReturnPct: number;
  annualRate: number;
  dailyRate: number;
  elapsedDays: number;
} {
  const { investedAmount, yieldRate, indexerType, purchaseDate } = params;

  if (investedAmount <= 0) {
    return { currentValue: 0, grossReturn: 0, grossReturnPct: 0, annualRate: 0, dailyRate: 0, elapsedDays: 0 };
  }

  const annualRate = getAnnualRate(indexerType, yieldRate);
  const dailyRate = Math.pow(1 + annualRate / 100, 1 / 252) - 1;

  const start = new Date(purchaseDate);
  const now = new Date();
  const calendarDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const businessDays = Math.floor(calendarDays * (252 / 365));

  const currentValue = investedAmount * Math.pow(1 + dailyRate, businessDays);
  const grossReturn = currentValue - investedAmount;
  const grossReturnPct = investedAmount > 0 ? (grossReturn / investedAmount) * 100 : 0;

  return {
    currentValue,
    grossReturn,
    grossReturnPct,
    annualRate,
    dailyRate,
    elapsedDays: calendarDays,
  };
}

/**
 * Get a display-friendly description of the yield
 */
export function formatYieldDescription(indexerType: string | null, yieldRate: string | null): string {
  if (!yieldRate) return indexerType || 'Pós-fixado';
  return yieldRate;
}

/**
 * Fixed Income Return Calculator
 * Calculates estimated current value for Brazilian fixed income assets
 * based on indexer type, yield rate, and elapsed time.
 */

// Current reference rates (updated periodically)
const REFERENCE_RATES = {
  CDI: 14.15, // % a.a. - Taxa CDI atual aproximada
  SELIC: 14.25, // % a.a. - Taxa Selic atual aproximada
  IPCA: 5.0, // % a.a. - IPCA acumulado 12m aproximado
};

interface FixedIncomeParams {
  investedAmount: number; // Total invested (qty * avgPrice)
  yieldRate: string | null; // e.g. "110% CDI", "12.5% a.a.", "IPCA + 6.5%"
  indexerType: string | null; // "Pré-fixado", "Pós-fixado", "CDI", "CDI+", "IPCA+", "Selic"
  purchaseDate: string; // ISO date string
  maturityDate?: string | null;
}

/**
 * Parse yield rate string to extract numeric value
 * Examples: "110% CDI" -> 110, "12.5% a.a." -> 12.5, "IPCA + 6.5%" -> 6.5
 */
function parseYieldRate(yieldRate: string): number {
  if (!yieldRate) return 100;
  const cleaned = yieldRate.replace(/[^\d.,%-]/g, ' ').trim();
  // Try to find a number
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
  const rate = yieldRate ? parseYieldRate(yieldRate) : 100;
  const indexer = (indexerType || 'Pós-fixado').trim();

  switch (indexer) {
    case 'Pré-fixado':
      // Rate is the fixed annual rate itself (e.g. 12.5% a.a.)
      return rate;
    case 'Pós-fixado':
    case 'CDI':
      // Rate is percentage of CDI (e.g. 110% CDI = 110% * 14.15%)
      return (rate / 100) * REFERENCE_RATES.CDI;
    case 'CDI+':
      // Rate is CDI + spread (e.g. CDI + 2% = 14.15% + 2%)
      return REFERENCE_RATES.CDI + rate;
    case 'IPCA+':
      // Rate is IPCA + spread (e.g. IPCA + 6.5% = 5% + 6.5%)
      return REFERENCE_RATES.IPCA + rate;
    case 'Selic':
      // Rate is percentage of Selic
      return (rate / 100) * REFERENCE_RATES.SELIC;
    default:
      return (rate / 100) * REFERENCE_RATES.CDI;
  }
}

/**
 * Calculate estimated current value of a fixed income asset
 * Uses compound interest with business days (252 days/year)
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
  // Daily rate using 252 business days
  const dailyRate = Math.pow(1 + annualRate / 100, 1 / 252) - 1;

  // Calculate elapsed calendar days, convert to approximate business days
  const start = new Date(purchaseDate);
  const now = new Date();
  const calendarDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  // Approximate business days: ~252/365 ratio
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

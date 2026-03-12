export interface Asset {
  ticker: string;
  name: string;
  type: 'Ação' | 'FII' | 'ETF' | 'ETF Internacional' | 'REIT' | 'Cripto' | 'Renda Fixa' | 'BDR' | 'Internacional' | 'Stock';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  change24h: number;
  allocation: number;
  sector?: string;
  source?: string;
  currency?: string;        // Original currency (BRL, USD, EUR, GBP)
  currentPriceBRL?: number;  // Price converted to BRL
  exchangeRate?: number;     // Exchange rate used
  originalPrice?: number;    // Price in original currency (from API directly)
}

export interface PortfolioSnapshot {
  date: string;
  value: number;
}

export interface AIInsight {
  id: string;
  type: 'recommendation' | 'alert' | 'analysis';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  ticker?: string;
  timestamp: string;
}

// Produção: sem dados demo — tudo vem do banco de dados
export const mockAssets: Asset[] = [];

export const mockPortfolioHistory: PortfolioSnapshot[] = [];

export const mockInsights: AIInsight[] = [];

export function formatCurrency(value: number, currency: string = 'BRL'): string {
  const currencyMap: Record<string, string> = {
    BRL: 'BRL', USD: 'USD', EUR: 'EUR', GBP: 'GBP', CHF: 'CHF', JPY: 'JPY',
  };
  const cur = currencyMap[currency] || 'BRL';
  const locale = cur === 'BRL' ? 'pt-BR' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function getPortfolioTotal(): number {
  return mockAssets.reduce((sum, a) => sum + a.currentPrice * a.quantity, 0);
}

export function getPortfolioCost(): number {
  return mockAssets.reduce((sum, a) => sum + a.avgPrice * a.quantity, 0);
}

export function getTotalGain(): number {
  return getPortfolioTotal() - getPortfolioCost();
}

export function getTotalGainPercent(): number {
  const cost = getPortfolioCost();
  return cost > 0 ? (getTotalGain() / cost) * 100 : 0;
}

export function getDailyChange(): number {
  return mockAssets.reduce((sum, a) => {
    const prevPrice = a.currentPrice / (1 + a.change24h / 100);
    return sum + (a.currentPrice - prevPrice) * a.quantity;
  }, 0);
}

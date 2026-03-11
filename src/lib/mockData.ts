export interface Asset {
  ticker: string;
  name: string;
  type: 'Ação' | 'FII' | 'ETF' | 'Cripto' | 'Renda Fixa';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  change24h: number;
  allocation: number;
  sector?: string;
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

export const mockAssets: Asset[] = [
  { ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação', quantity: 500, avgPrice: 28.50, currentPrice: 36.82, change24h: 1.23, allocation: 18.5, sector: 'Petróleo' },
  { ticker: 'VALE3', name: 'Vale ON', type: 'Ação', quantity: 300, avgPrice: 62.30, currentPrice: 68.45, change24h: -0.87, allocation: 14.2, sector: 'Mineração' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'Ação', quantity: 400, avgPrice: 25.10, currentPrice: 32.15, change24h: 0.45, allocation: 12.8, sector: 'Bancos' },
  { ticker: 'HGLG11', name: 'CSHG Logística', type: 'FII', quantity: 80, avgPrice: 158.00, currentPrice: 165.30, change24h: 0.12, allocation: 10.5, sector: 'Logística' },
  { ticker: 'XPML11', name: 'XP Malls', type: 'FII', quantity: 120, avgPrice: 95.50, currentPrice: 102.80, change24h: -0.34, allocation: 9.8, sector: 'Shopping' },
  { ticker: 'BTC', name: 'Bitcoin', type: 'Cripto', quantity: 0.15, avgPrice: 180000, currentPrice: 345000, change24h: 2.45, allocation: 8.2, sector: 'Cripto' },
  { ticker: 'IVVB11', name: 'iShares S&P 500', type: 'ETF', quantity: 200, avgPrice: 280.00, currentPrice: 312.50, change24h: 0.67, allocation: 7.5, sector: 'Internacional' },
  { ticker: 'WEGE3', name: 'WEG ON', type: 'Ação', quantity: 150, avgPrice: 35.20, currentPrice: 42.80, change24h: 1.89, allocation: 6.5, sector: 'Indústria' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'Ação', quantity: 250, avgPrice: 42.00, currentPrice: 54.30, change24h: 0.32, allocation: 6.0, sector: 'Bancos' },
  { ticker: 'TESOURO SELIC', name: 'Tesouro Selic 2029', type: 'Renda Fixa', quantity: 5, avgPrice: 14200, currentPrice: 14850, change24h: 0.04, allocation: 6.0, sector: 'Governo' },
];

export const mockPortfolioHistory: PortfolioSnapshot[] = (() => {
  const data: PortfolioSnapshot[] = [];
  let value = 85000;
  const now = new Date();
  for (let i = 365; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    value += (Math.random() - 0.45) * 800;
    value = Math.max(value, 70000);
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    });
  }
  return data;
})();

export const mockInsights: AIInsight[] = [
  {
    id: '1',
    type: 'alert',
    title: 'VALE3 próxima de suporte crítico',
    description: 'O ativo está 2.3% acima do suporte em R$66.90. Considere ajustar stop loss. Volume de negociação 40% acima da média.',
    severity: 'warning',
    ticker: 'VALE3',
    timestamp: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'recommendation',
    title: 'Rebalanceamento sugerido',
    description: 'Sua alocação em Bancos (18.8%) está acima do target de 15%. Considere realizar lucros em ITUB4 e diversificar em setores de tecnologia.',
    severity: 'info',
    timestamp: new Date().toISOString(),
  },
  {
    id: '3',
    type: 'analysis',
    title: 'BTC em tendência de alta',
    description: 'Bitcoin rompeu resistência de R$340k com volume crescente. RSI em 62, ainda sem sobrecompra. Próximo alvo: R$380k.',
    severity: 'info',
    ticker: 'BTC',
    timestamp: new Date().toISOString(),
  },
  {
    id: '4',
    type: 'alert',
    title: 'Dividendos PETR4 em 5 dias',
    description: 'Data ex-dividendo de PETR4: 15/03/2026. Yield estimado de 2.1% neste pagamento. Mantenha posição para capturar.',
    severity: 'info',
    ticker: 'PETR4',
    timestamp: new Date().toISOString(),
  },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
  return (getTotalGain() / getPortfolioCost()) * 100;
}

export function getDailyChange(): number {
  return mockAssets.reduce((sum, a) => {
    const prevPrice = a.currentPrice / (1 + a.change24h / 100);
    return sum + (a.currentPrice - prevPrice) * a.quantity;
  }, 0);
}

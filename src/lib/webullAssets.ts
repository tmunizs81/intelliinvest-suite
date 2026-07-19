/**
 * Curadoria dos ativos mais negociados na Webull (broker US).
 * Foco: ações US, ETFs US, ADRs, cripto (via Webull Crypto).
 */

export interface WebullAsset {
  ticker: string;
  name: string;
  category: 'stock' | 'etf' | 'adr' | 'reit' | 'crypto';
}

export const WEBULL_ASSETS: WebullAsset[] = [
  // === Mega Caps / Tech ===
  { ticker: 'AAPL', name: 'Apple Inc.', category: 'stock' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', category: 'stock' },
  { ticker: 'GOOGL', name: 'Alphabet Class A', category: 'stock' },
  { ticker: 'GOOG', name: 'Alphabet Class C', category: 'stock' },
  { ticker: 'AMZN', name: 'Amazon.com', category: 'stock' },
  { ticker: 'META', name: 'Meta Platforms', category: 'stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', category: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', category: 'stock' },
  { ticker: 'AVGO', name: 'Broadcom Inc.', category: 'stock' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', category: 'stock' },
  { ticker: 'INTC', name: 'Intel Corp.', category: 'stock' },
  { ticker: 'NFLX', name: 'Netflix Inc.', category: 'stock' },
  { ticker: 'ADBE', name: 'Adobe Inc.', category: 'stock' },
  { ticker: 'PLTR', name: 'Palantir Technologies', category: 'stock' },
  { ticker: 'SOFI', name: 'SoFi Technologies', category: 'stock' },
  { ticker: 'RIVN', name: 'Rivian Automotive', category: 'stock' },
  { ticker: 'LCID', name: 'Lucid Group', category: 'stock' },
  { ticker: 'NIO', name: 'NIO Inc.', category: 'adr' },
  { ticker: 'COIN', name: 'Coinbase Global', category: 'stock' },
  { ticker: 'MSTR', name: 'MicroStrategy', category: 'stock' },
  { ticker: 'HOOD', name: 'Robinhood Markets', category: 'stock' },
  { ticker: 'GME', name: 'GameStop Corp.', category: 'stock' },
  { ticker: 'AMC', name: 'AMC Entertainment', category: 'stock' },
  { ticker: 'BABA', name: 'Alibaba Group ADR', category: 'adr' },
  { ticker: 'PDD', name: 'PDD Holdings', category: 'adr' },
  { ticker: 'JD', name: 'JD.com ADR', category: 'adr' },

  // === Finance / Consumer ===
  { ticker: 'BRK.B', name: 'Berkshire Hathaway B', category: 'stock' },
  { ticker: 'JPM', name: 'JPMorgan Chase', category: 'stock' },
  { ticker: 'BAC', name: 'Bank of America', category: 'stock' },
  { ticker: 'V', name: 'Visa Inc.', category: 'stock' },
  { ticker: 'MA', name: 'Mastercard Inc.', category: 'stock' },
  { ticker: 'PYPL', name: 'PayPal Holdings', category: 'stock' },
  { ticker: 'DIS', name: 'Walt Disney Co.', category: 'stock' },
  { ticker: 'WMT', name: 'Walmart Inc.', category: 'stock' },
  { ticker: 'COST', name: 'Costco Wholesale', category: 'stock' },
  { ticker: 'F', name: 'Ford Motor Co.', category: 'stock' },
  { ticker: 'GM', name: 'General Motors', category: 'stock' },

  // === ETFs populares ===
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', category: 'etf' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', category: 'etf' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'etf' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market', category: 'etf' },
  { ticker: 'IWM', name: 'iShares Russell 2000', category: 'etf' },
  { ticker: 'DIA', name: 'SPDR Dow Jones', category: 'etf' },
  { ticker: 'ARKK', name: 'ARK Innovation ETF', category: 'etf' },
  { ticker: 'SOXL', name: 'Direxion Daily Semi Bull 3x', category: 'etf' },
  { ticker: 'TQQQ', name: 'ProShares UltraPro QQQ', category: 'etf' },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity', category: 'etf' },
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income', category: 'etf' },
  { ticker: 'GLD', name: 'SPDR Gold Shares', category: 'etf' },
  { ticker: 'BITO', name: 'ProShares Bitcoin Strategy', category: 'etf' },

  // === REITs ===
  { ticker: 'O', name: 'Realty Income Corp.', category: 'reit' },
  { ticker: 'VNQ', name: 'Vanguard Real Estate ETF', category: 'reit' },

  // === Cripto (Webull Crypto) ===
  { ticker: 'BTC-USD', name: 'Bitcoin', category: 'crypto' },
  { ticker: 'ETH-USD', name: 'Ethereum', category: 'crypto' },
  { ticker: 'SOL-USD', name: 'Solana', category: 'crypto' },
  { ticker: 'DOGE-USD', name: 'Dogecoin', category: 'crypto' },
];

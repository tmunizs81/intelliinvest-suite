/**
 * Curadoria dos ativos mais negociados na corretora Avenue (Brasileiros investindo nos EUA).
 * Inclui:
 *  - Ações US (NYSE/NASDAQ) — top blue chips + ADRs disponíveis via Avenue
 *  - ETFs US (SPY, QQQ, VOO, etc.)
 *  - ETFs irlandeses UCITS (CSPX.L, VUAA.L, IWDA.L, etc.) — tax-efficient para BR
 *  - REITs populares
 *
 * Todos são resolvíveis pelo Yahoo Finance (com sufixo .L quando aplicável).
 */

export interface AvenueAsset {
  ticker: string;
  name: string;
  category: 'stock' | 'etf' | 'ucits' | 'reit' | 'adr';
}

export const AVENUE_ASSETS: AvenueAsset[] = [
  // === Ações US — Mega Caps / Tech ===
  { ticker: 'AAPL', name: 'Apple Inc.', category: 'stock' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', category: 'stock' },
  { ticker: 'GOOGL', name: 'Alphabet Class A', category: 'stock' },
  { ticker: 'GOOG', name: 'Alphabet Class C', category: 'stock' },
  { ticker: 'AMZN', name: 'Amazon.com', category: 'stock' },
  { ticker: 'META', name: 'Meta Platforms', category: 'stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', category: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', category: 'stock' },
  { ticker: 'AVGO', name: 'Broadcom Inc.', category: 'stock' },
  { ticker: 'ORCL', name: 'Oracle Corp.', category: 'stock' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', category: 'stock' },
  { ticker: 'INTC', name: 'Intel Corp.', category: 'stock' },
  { ticker: 'NFLX', name: 'Netflix Inc.', category: 'stock' },
  { ticker: 'ADBE', name: 'Adobe Inc.', category: 'stock' },
  { ticker: 'CRM', name: 'Salesforce Inc.', category: 'stock' },
  { ticker: 'PLTR', name: 'Palantir Technologies', category: 'stock' },
  { ticker: 'SNOW', name: 'Snowflake Inc.', category: 'stock' },
  { ticker: 'UBER', name: 'Uber Technologies', category: 'stock' },
  { ticker: 'SHOP', name: 'Shopify Inc.', category: 'stock' },
  { ticker: 'PYPL', name: 'PayPal Holdings', category: 'stock' },
  { ticker: 'SQ', name: 'Block Inc.', category: 'stock' },
  { ticker: 'COIN', name: 'Coinbase Global', category: 'stock' },
  { ticker: 'MSTR', name: 'MicroStrategy', category: 'stock' },
  { ticker: 'HOOD', name: 'Robinhood Markets', category: 'stock' },

  // === Ações US — Finance / Consumer / Health ===
  { ticker: 'BRK.B', name: 'Berkshire Hathaway B', category: 'stock' },
  { ticker: 'JPM', name: 'JPMorgan Chase', category: 'stock' },
  { ticker: 'BAC', name: 'Bank of America', category: 'stock' },
  { ticker: 'V', name: 'Visa Inc.', category: 'stock' },
  { ticker: 'MA', name: 'Mastercard Inc.', category: 'stock' },
  { ticker: 'WMT', name: 'Walmart Inc.', category: 'stock' },
  { ticker: 'COST', name: 'Costco Wholesale', category: 'stock' },
  { ticker: 'HD', name: 'Home Depot', category: 'stock' },
  { ticker: 'KO', name: 'Coca-Cola Co.', category: 'stock' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', category: 'stock' },
  { ticker: 'MCD', name: "McDonald's Corp.", category: 'stock' },
  { ticker: 'SBUX', name: 'Starbucks Corp.', category: 'stock' },
  { ticker: 'DIS', name: 'Walt Disney Co.', category: 'stock' },
  { ticker: 'NKE', name: 'Nike Inc.', category: 'stock' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', category: 'stock' },
  { ticker: 'LLY', name: 'Eli Lilly & Co.', category: 'stock' },
  { ticker: 'UNH', name: 'UnitedHealth Group', category: 'stock' },
  { ticker: 'PFE', name: 'Pfizer Inc.', category: 'stock' },
  { ticker: 'ABBV', name: 'AbbVie Inc.', category: 'stock' },
  { ticker: 'XOM', name: 'Exxon Mobil', category: 'stock' },
  { ticker: 'CVX', name: 'Chevron Corp.', category: 'stock' },
  { ticker: 'BA', name: 'Boeing Co.', category: 'stock' },
  { ticker: 'CAT', name: 'Caterpillar Inc.', category: 'stock' },
  { ticker: 'GE', name: 'General Electric', category: 'stock' },

  // === ADRs brasileiros/globais na NYSE ===
  { ticker: 'PBR', name: 'Petrobras ADR', category: 'adr' },
  { ticker: 'VALE', name: 'Vale ADR', category: 'adr' },
  { ticker: 'ITUB', name: 'Itaú Unibanco ADR', category: 'adr' },
  { ticker: 'BBD', name: 'Bradesco ADR', category: 'adr' },
  { ticker: 'ERJ', name: 'Embraer ADR', category: 'adr' },
  { ticker: 'BABA', name: 'Alibaba ADR', category: 'adr' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor ADR', category: 'adr' },
  { ticker: 'ASML', name: 'ASML Holding ADR', category: 'adr' },
  { ticker: 'NVO', name: 'Novo Nordisk ADR', category: 'adr' },
  { ticker: 'SAP', name: 'SAP SE ADR', category: 'adr' },
  { ticker: 'MELI', name: 'MercadoLibre', category: 'adr' },
  { ticker: 'NU', name: 'Nu Holdings', category: 'adr' },
  { ticker: 'STNE', name: 'StoneCo', category: 'adr' },
  { ticker: 'PAGS', name: 'PagSeguro Digital', category: 'adr' },

  // === ETFs US ===
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', category: 'etf' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'etf' },
  { ticker: 'IVV', name: 'iShares Core S&P 500', category: 'etf' },
  { ticker: 'QQQ', name: 'Invesco QQQ (Nasdaq 100)', category: 'etf' },
  { ticker: 'QQQM', name: 'Invesco QQQ Mini', category: 'etf' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market', category: 'etf' },
  { ticker: 'VT', name: 'Vanguard Total World', category: 'etf' },
  { ticker: 'VXUS', name: 'Vanguard Total Intl Stock', category: 'etf' },
  { ticker: 'VEA', name: 'Vanguard FTSE Developed Markets', category: 'etf' },
  { ticker: 'VWO', name: 'Vanguard FTSE Emerging Markets', category: 'etf' },
  { ticker: 'EWZ', name: 'iShares MSCI Brazil ETF', category: 'etf' },
  { ticker: 'DIA', name: 'SPDR Dow Jones Industrial', category: 'etf' },
  { ticker: 'IWM', name: 'iShares Russell 2000', category: 'etf' },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity', category: 'etf' },
  { ticker: 'VYM', name: 'Vanguard High Dividend Yield', category: 'etf' },
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income', category: 'etf' },
  { ticker: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium', category: 'etf' },
  { ticker: 'SMH', name: 'VanEck Semiconductor', category: 'etf' },
  { ticker: 'SOXX', name: 'iShares Semiconductor', category: 'etf' },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR', category: 'etf' },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR', category: 'etf' },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR', category: 'etf' },
  { ticker: 'XLV', name: 'Health Care Select Sector SPDR', category: 'etf' },
  { ticker: 'GLD', name: 'SPDR Gold Shares', category: 'etf' },
  { ticker: 'IAU', name: 'iShares Gold Trust', category: 'etf' },
  { ticker: 'SLV', name: 'iShares Silver Trust', category: 'etf' },
  { ticker: 'BND', name: 'Vanguard Total Bond Market', category: 'etf' },
  { ticker: 'AGG', name: 'iShares Core US Aggregate Bond', category: 'etf' },
  { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond', category: 'etf' },
  { ticker: 'SGOV', name: 'iShares 0-3 Month Treasury Bond', category: 'etf' },
  { ticker: 'IBIT', name: 'iShares Bitcoin Trust', category: 'etf' },
  { ticker: 'FBTC', name: 'Fidelity Wise Origin Bitcoin', category: 'etf' },
  { ticker: 'ARKK', name: 'ARK Innovation ETF', category: 'etf' },

  // === ETFs Irlandeses UCITS (Avenue Global — .L / .DE) ===
  { ticker: 'CSPX.L', name: 'iShares Core S&P 500 UCITS (Acc)', category: 'ucits' },
  { ticker: 'VUAA.L', name: 'Vanguard S&P 500 UCITS (Acc)', category: 'ucits' },
  { ticker: 'VUSA.L', name: 'Vanguard S&P 500 UCITS (Dist)', category: 'ucits' },
  { ticker: 'IWDA.L', name: 'iShares Core MSCI World UCITS (Acc)', category: 'ucits' },
  { ticker: 'SWDA.L', name: 'iShares Core MSCI World UCITS (Acc)', category: 'ucits' },
  { ticker: 'VWRA.L', name: 'Vanguard FTSE All-World UCITS (Acc)', category: 'ucits' },
  { ticker: 'VWRL.L', name: 'Vanguard FTSE All-World UCITS (Dist)', category: 'ucits' },
  { ticker: 'EIMI.L', name: 'iShares Core MSCI EM IMI UCITS', category: 'ucits' },
  { ticker: 'VFEM.L', name: 'Vanguard FTSE Emerging Markets UCITS', category: 'ucits' },
  { ticker: 'EQQQ.L', name: 'Invesco EQQQ Nasdaq-100 UCITS', category: 'ucits' },
  { ticker: 'IUIT.L', name: 'iShares S&P 500 IT Sector UCITS', category: 'ucits' },
  { ticker: 'IUHC.L', name: 'iShares S&P 500 Health Care UCITS', category: 'ucits' },
  { ticker: 'IUFS.L', name: 'iShares S&P 500 Financials UCITS', category: 'ucits' },
  { ticker: 'SGLN.L', name: 'iShares Physical Gold ETC', category: 'ucits' },
  { ticker: 'IGLN.L', name: 'iShares Physical Gold ETC', category: 'ucits' },
  { ticker: 'DTLA.L', name: 'iShares $ Treasury Bond 20+yr UCITS', category: 'ucits' },
  { ticker: 'IDTL.L', name: 'iShares $ Treasury Bond 20+yr UCITS (Dist)', category: 'ucits' },
  { ticker: 'IBTM.L', name: 'iShares $ Treasury Bond 7-10yr UCITS', category: 'ucits' },
  { ticker: 'LQDE.L', name: 'iShares $ Corp Bond UCITS', category: 'ucits' },

  // === REITs populares na Avenue ===
  { ticker: 'O', name: 'Realty Income Corp.', category: 'reit' },
  { ticker: 'VNQ', name: 'Vanguard Real Estate ETF', category: 'reit' },
  { ticker: 'PLD', name: 'Prologis Inc.', category: 'reit' },
  { ticker: 'AMT', name: 'American Tower', category: 'reit' },
  { ticker: 'EQIX', name: 'Equinix Inc.', category: 'reit' },
  { ticker: 'SPG', name: 'Simon Property Group', category: 'reit' },
  { ticker: 'PSA', name: 'Public Storage', category: 'reit' },
  { ticker: 'WELL', name: 'Welltower Inc.', category: 'reit' },
];

/** Verifica se um ticker faz parte do universo Avenue. */
export function isAvenueAsset(ticker: string): boolean {
  const t = ticker.toUpperCase().trim();
  return AVENUE_ASSETS.some((a) => a.ticker.toUpperCase() === t);
}

/** Retorna nome amigável se o ticker for Avenue-listado. */
export function getAvenueName(ticker: string): string | null {
  const t = ticker.toUpperCase().trim();
  return AVENUE_ASSETS.find((a) => a.ticker.toUpperCase() === t)?.name || null;
}

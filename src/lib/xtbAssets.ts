/**
 * Curadoria dos ativos mais negociados na XTB (broker europeu).
 * Foco: ações US/EU + ETFs UCITS irlandeses/alemães + commodities.
 * Todos resolvíveis pelo Yahoo Finance.
 */

export interface XTBAsset {
  ticker: string;
  name: string;
  category: 'stock' | 'etf' | 'ucits' | 'reit';
}

export const XTB_ASSETS: XTBAsset[] = [
  // === Ações US ===
  { ticker: 'AAPL', name: 'Apple Inc.', category: 'stock' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', category: 'stock' },
  { ticker: 'GOOGL', name: 'Alphabet Class A', category: 'stock' },
  { ticker: 'AMZN', name: 'Amazon.com', category: 'stock' },
  { ticker: 'META', name: 'Meta Platforms', category: 'stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', category: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', category: 'stock' },
  { ticker: 'NFLX', name: 'Netflix Inc.', category: 'stock' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', category: 'stock' },
  { ticker: 'JPM', name: 'JPMorgan Chase', category: 'stock' },
  { ticker: 'V', name: 'Visa Inc.', category: 'stock' },
  { ticker: 'MA', name: 'Mastercard Inc.', category: 'stock' },
  { ticker: 'KO', name: 'Coca-Cola Co.', category: 'stock' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', category: 'stock' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', category: 'stock' },
  { ticker: 'PG', name: 'Procter & Gamble', category: 'stock' },
  { ticker: 'XOM', name: 'Exxon Mobil', category: 'stock' },
  { ticker: 'CVX', name: 'Chevron Corp.', category: 'stock' },

  // === Ações EU (Xetra/LSE/Euronext) ===
  { ticker: 'SAP.DE', name: 'SAP SE', category: 'stock' },
  { ticker: 'SIE.DE', name: 'Siemens AG', category: 'stock' },
  { ticker: 'ALV.DE', name: 'Allianz SE', category: 'stock' },
  { ticker: 'BMW.DE', name: 'BMW AG', category: 'stock' },
  { ticker: 'VOW3.DE', name: 'Volkswagen AG', category: 'stock' },
  { ticker: 'ASML.AS', name: 'ASML Holding', category: 'stock' },
  { ticker: 'MC.PA', name: 'LVMH', category: 'stock' },
  { ticker: 'OR.PA', name: "L'Oréal", category: 'stock' },
  { ticker: 'AIR.PA', name: 'Airbus SE', category: 'stock' },
  { ticker: 'NESN.SW', name: 'Nestlé SA', category: 'stock' },
  { ticker: 'NOVN.SW', name: 'Novartis AG', category: 'stock' },
  { ticker: 'ROG.SW', name: 'Roche Holding', category: 'stock' },
  { ticker: 'SHEL.L', name: 'Shell plc', category: 'stock' },
  { ticker: 'HSBA.L', name: 'HSBC Holdings', category: 'stock' },
  { ticker: 'AZN.L', name: 'AstraZeneca', category: 'stock' },
  { ticker: 'ULVR.L', name: 'Unilever plc', category: 'stock' },

  // === ETFs UCITS irlandeses (tax-efficient) ===
  { ticker: 'CSPX.L', name: 'iShares Core S&P 500 UCITS (Acc)', category: 'ucits' },
  { ticker: 'VUAA.L', name: 'Vanguard S&P 500 UCITS (Acc)', category: 'ucits' },
  { ticker: 'IWDA.L', name: 'iShares Core MSCI World UCITS (Acc)', category: 'ucits' },
  { ticker: 'VWRA.L', name: 'Vanguard FTSE All-World UCITS (Acc)', category: 'ucits' },
  { ticker: 'EIMI.L', name: 'iShares Core MSCI EM IMI UCITS (Acc)', category: 'ucits' },
  { ticker: 'EQQQ.L', name: 'Invesco EQQQ Nasdaq-100 UCITS', category: 'ucits' },
  { ticker: 'SXR8.DE', name: 'iShares Core S&P 500 (Acc) Xetra', category: 'ucits' },
  { ticker: 'EUNL.DE', name: 'iShares Core MSCI World (Acc) Xetra', category: 'ucits' },

  // === ETFs setoriais / temáticos ===
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', category: 'etf' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', category: 'etf' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'etf' },
  { ticker: 'GLD', name: 'SPDR Gold Shares', category: 'etf' },
  { ticker: 'SLV', name: 'iShares Silver Trust', category: 'etf' },
];

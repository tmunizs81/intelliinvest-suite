/**
 * Curadoria dos ativos mais negociados no C6 Bank / C6 Invest.
 * Foco: Ações B3, FIIs, ETFs B3, BDRs, Tesouro Direto + C6 Global (US via fracionário).
 */

export interface C6Asset {
  ticker: string;
  name: string;
  category: 'stock' | 'fii' | 'etf' | 'bdr' | 'us_stock' | 'us_etf';
}

export const C6_ASSETS: C6Asset[] = [
  // === Ações B3 blue chips ===
  { ticker: 'PETR4', name: 'Petrobras PN', category: 'stock' },
  { ticker: 'PETR3', name: 'Petrobras ON', category: 'stock' },
  { ticker: 'VALE3', name: 'Vale ON', category: 'stock' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', category: 'stock' },
  { ticker: 'BBDC4', name: 'Bradesco PN', category: 'stock' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', category: 'stock' },
  { ticker: 'ABEV3', name: 'Ambev ON', category: 'stock' },
  { ticker: 'B3SA3', name: 'B3 ON', category: 'stock' },
  { ticker: 'WEGE3', name: 'Weg ON', category: 'stock' },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', category: 'stock' },
  { ticker: 'LREN3', name: 'Lojas Renner ON', category: 'stock' },
  { ticker: 'SUZB3', name: 'Suzano ON', category: 'stock' },
  { ticker: 'RENT3', name: 'Localiza ON', category: 'stock' },
  { ticker: 'RADL3', name: 'Raia Drogasil ON', category: 'stock' },
  { ticker: 'PRIO3', name: 'PetroRio ON', category: 'stock' },
  { ticker: 'HAPV3', name: 'Hapvida ON', category: 'stock' },
  { ticker: 'ELET3', name: 'Eletrobras ON', category: 'stock' },
  { ticker: 'ITSA4', name: 'Itaúsa PN', category: 'stock' },
  { ticker: 'SANB11', name: 'Santander BR Unit', category: 'stock' },
  { ticker: 'CMIG4', name: 'Cemig PN', category: 'stock' },

  // === FIIs populares ===
  { ticker: 'MXRF11', name: 'Maxi Renda FII', category: 'fii' },
  { ticker: 'HGLG11', name: 'CSHG Logística FII', category: 'fii' },
  { ticker: 'KNRI11', name: 'Kinea Renda Imob FII', category: 'fii' },
  { ticker: 'XPML11', name: 'XP Malls FII', category: 'fii' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers', category: 'fii' },
  { ticker: 'BCFF11', name: 'BTG Fundo de Fundos', category: 'fii' },
  { ticker: 'HGRE11', name: 'CSHG Real Estate', category: 'fii' },
  { ticker: 'BTLG11', name: 'BTG Logística', category: 'fii' },
  { ticker: 'RECR11', name: 'REC Recebíveis Imob', category: 'fii' },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos', category: 'fii' },

  // === ETFs B3 ===
  { ticker: 'BOVA11', name: 'iShares Ibovespa', category: 'etf' },
  { ticker: 'IVVB11', name: 'iShares S&P 500 (BRL)', category: 'etf' },
  { ticker: 'SMAL11', name: 'iShares Small Cap', category: 'etf' },
  { ticker: 'BOVV11', name: 'It Now Ibovespa', category: 'etf' },
  { ticker: 'DIVO11', name: 'It Now IDIV', category: 'etf' },
  { ticker: 'HASH11', name: 'Hashdex Nasdaq Crypto', category: 'etf' },

  // === BDRs ===
  { ticker: 'AAPL34', name: 'Apple BDR', category: 'bdr' },
  { ticker: 'MSFT34', name: 'Microsoft BDR', category: 'bdr' },
  { ticker: 'AMZO34', name: 'Amazon BDR', category: 'bdr' },
  { ticker: 'GOGL34', name: 'Alphabet BDR', category: 'bdr' },
  { ticker: 'NVDC34', name: 'NVIDIA BDR', category: 'bdr' },
  { ticker: 'TSLA34', name: 'Tesla BDR', category: 'bdr' },
  { ticker: 'M1TA34', name: 'Meta BDR', category: 'bdr' },
  { ticker: 'DISB34', name: 'Disney BDR', category: 'bdr' },

  // === C6 Global — ações US fracionadas ===
  { ticker: 'AAPL', name: 'Apple Inc.', category: 'us_stock' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', category: 'us_stock' },
  { ticker: 'AMZN', name: 'Amazon.com', category: 'us_stock' },
  { ticker: 'GOOGL', name: 'Alphabet Class A', category: 'us_stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', category: 'us_stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', category: 'us_stock' },
  { ticker: 'META', name: 'Meta Platforms', category: 'us_stock' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', category: 'us_etf' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', category: 'us_etf' },
  { ticker: 'VOO', name: 'Vanguard S&P 500', category: 'us_etf' },
];

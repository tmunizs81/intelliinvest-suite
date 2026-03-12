/**
 * Classifica o tipo de ativo com base no ticker.
 * Ordem de prioridade: tipo explícito > detecção por padrão do ticker.
 */

const CRYPTO_TICKERS = new Set([
  'BTC', 'BITCOIN', 'ETH', 'ETHEREUM', 'BNB', 'SOL', 'SOLANA',
  'ADA', 'CARDANO', 'XRP', 'RIPPLE', 'DOT', 'POLKADOT',
  'DOGE', 'DOGECOIN', 'AVAX', 'MATIC', 'LINK', 'UNI',
  'ATOM', 'LTC', 'LITECOIN', 'NEAR', 'APT', 'ARB', 'OP',
  'USDT', 'USDC', 'DAI', 'BUSD',
  'SHIB', 'FIL', 'ALGO', 'HBAR', 'VET', 'ICP',
  'AAVE', 'GRT', 'SAND', 'MANA', 'CRV', 'MKR',
  'RENDER', 'FET', 'SUI', 'SEI', 'TIA', 'INJ',
  'PEPE', 'WIF', 'BONK', 'FLOKI', 'NOT', 'TON',
  'PENDLE', 'JUP', 'W', 'STRK', 'PYTH', 'JTO',
  'ONDO', 'ENA', 'ETHFI', 'MANTA', 'DYM', 'PIXEL',
  'WLD', 'BLUR', 'IMX', 'RUNE', 'SNX', 'COMP',
  'ENS', 'LDO', 'RPL', 'SSV', 'EIGEN', 'PENDLE',
  'XLM', 'STELLAR', 'TRX', 'TRON', 'EOS', 'NEO',
  'ZEC', 'ZCASH', 'XMR', 'MONERO', 'DASH',
  'BCH', 'ETC',
]);

const ETF_TICKERS_BR = new Set([
  'BOVA11', 'IVVB11', 'SMAL11', 'HASH11', 'IMAB11', 'FIXA11',
  'GOLD11', 'DIVO11', 'ECOO11', 'BOVV11', 'XFIX11', 'MATB11',
  'FIND11', 'PIBB11', 'SPXI11', 'NASD11', 'EURP11', 'ACWI11',
  'ETHE11', 'QBTC11', 'BITI11', 'DEFI11', 'WEB311', 'META11',
  'QDFI11', 'BITH11', 'QETH11', 'SOLH11',
  'IRFM11', 'B5P211', 'IB5M11', 'NTNS11',
]);

export function classifyAssetType(ticker: string, explicitType?: string): string {
  // Se já tem tipo explícito válido, usa ele
  if (explicitType && explicitType !== 'Ação') return explicitType;
  if (explicitType === 'Cripto' || explicitType === 'Crypto') return 'Cripto';

  const t = ticker.toUpperCase().trim();

  // 1. Cripto (por nome)
  if (CRYPTO_TICKERS.has(t)) return 'Cripto';

  // 2. ETF brasileiro específico
  if (ETF_TICKERS_BR.has(t)) return 'ETF';

  // 3. ETF Internacional (sufixo .L, .DE, .AS, etc.)
  if (/\.(L|DE|AS|PA|MI|SW)$/.test(t)) return 'ETF Internacional';

  // 4. FII (padrão XXXX11)
  if (/^[A-Z]{4}11$/.test(t)) return 'FII';

  // 4. BDR (padrão XXXX34, XXXX35, XXXX39)
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return 'BDR';

  // 5. Ação brasileira (padrão XXXX3, XXXX4, XXXX5, XXXX6, etc.)
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return 'Ação';

  // 6. Renda Fixa (prefixos conhecidos)
  if (/^(TESOURO|CDB|LCI|LCA|CRI|CRA|DEB)/i.test(t)) return 'Renda Fixa';

  // 7. Se não bate com nada, provavelmente é internacional ou cripto
  // Tickers curtos sem números são geralmente cripto ou ação internacional
  if (/^[A-Z]{2,5}$/.test(t) && t.length <= 4 && CRYPTO_TICKERS.has(t)) return 'Cripto';

  // 8. Se tem tipo explícito "Ação" e passou por tudo, mantém
  if (explicitType === 'Ação') return 'Ação';

  // 9. Default: se não tem número, pode ser internacional
  if (!/\d/.test(t)) return 'Internacional';

  return 'Ação';
}

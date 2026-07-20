/**
 * Curadoria dos ativos cripto mais negociados nas principais exchanges.
 * Tickers no formato Yahoo Finance (SYMBOL-USD) para resolução automática de cotação.
 *
 * Exchanges cobertas:
 *  - Binance (global — maior volume mundial)
 *  - Coinbase (US — regulada SEC)
 *  - Mercado Bitcoin (BR — maior exchange nacional)
 *  - Foxbit (BR)
 *  - KuCoin (global — altcoins)
 */

export interface CryptoAsset {
  ticker: string;
  name: string;
  category: 'crypto';
}

// Núcleo comum das principais exchanges (top market cap)
const CORE_CRYPTO: CryptoAsset[] = [
  { ticker: 'BTC-USD', name: 'Bitcoin', category: 'crypto' },
  { ticker: 'ETH-USD', name: 'Ethereum', category: 'crypto' },
  { ticker: 'BNB-USD', name: 'BNB', category: 'crypto' },
  { ticker: 'SOL-USD', name: 'Solana', category: 'crypto' },
  { ticker: 'XRP-USD', name: 'XRP', category: 'crypto' },
  { ticker: 'ADA-USD', name: 'Cardano', category: 'crypto' },
  { ticker: 'DOGE-USD', name: 'Dogecoin', category: 'crypto' },
  { ticker: 'AVAX-USD', name: 'Avalanche', category: 'crypto' },
  { ticker: 'DOT-USD', name: 'Polkadot', category: 'crypto' },
  { ticker: 'MATIC-USD', name: 'Polygon', category: 'crypto' },
  { ticker: 'LINK-USD', name: 'Chainlink', category: 'crypto' },
  { ticker: 'LTC-USD', name: 'Litecoin', category: 'crypto' },
  { ticker: 'TRX-USD', name: 'TRON', category: 'crypto' },
  { ticker: 'UNI-USD', name: 'Uniswap', category: 'crypto' },
  { ticker: 'ATOM-USD', name: 'Cosmos', category: 'crypto' },
  { ticker: 'XLM-USD', name: 'Stellar', category: 'crypto' },
  { ticker: 'BCH-USD', name: 'Bitcoin Cash', category: 'crypto' },
  { ticker: 'ETC-USD', name: 'Ethereum Classic', category: 'crypto' },
  { ticker: 'NEAR-USD', name: 'NEAR Protocol', category: 'crypto' },
  { ticker: 'APT-USD', name: 'Aptos', category: 'crypto' },
  { ticker: 'ARB-USD', name: 'Arbitrum', category: 'crypto' },
  { ticker: 'OP-USD', name: 'Optimism', category: 'crypto' },
  { ticker: 'FIL-USD', name: 'Filecoin', category: 'crypto' },
  { ticker: 'HBAR-USD', name: 'Hedera', category: 'crypto' },
  { ticker: 'ICP-USD', name: 'Internet Computer', category: 'crypto' },
  { ticker: 'VET-USD', name: 'VeChain', category: 'crypto' },
  { ticker: 'AAVE-USD', name: 'Aave', category: 'crypto' },
  { ticker: 'MKR-USD', name: 'Maker', category: 'crypto' },
  { ticker: 'GRT-USD', name: 'The Graph', category: 'crypto' },
  { ticker: 'SAND-USD', name: 'The Sandbox', category: 'crypto' },
  { ticker: 'MANA-USD', name: 'Decentraland', category: 'crypto' },
  { ticker: 'AXS-USD', name: 'Axie Infinity', category: 'crypto' },
  { ticker: 'USDT-USD', name: 'Tether', category: 'crypto' },
  { ticker: 'USDC-USD', name: 'USD Coin', category: 'crypto' },
];

// Extras específicos por exchange
const BINANCE_EXTRA: CryptoAsset[] = [
  { ticker: 'SHIB-USD', name: 'Shiba Inu', category: 'crypto' },
  { ticker: 'PEPE-USD', name: 'Pepe', category: 'crypto' },
  { ticker: 'INJ-USD', name: 'Injective', category: 'crypto' },
  { ticker: 'SUI-USD', name: 'Sui', category: 'crypto' },
  { ticker: 'TIA-USD', name: 'Celestia', category: 'crypto' },
  { ticker: 'FTM-USD', name: 'Fantom', category: 'crypto' },
  { ticker: 'RUNE-USD', name: 'THORChain', category: 'crypto' },
  { ticker: 'FET-USD', name: 'Fetch.ai', category: 'crypto' },
];

const COINBASE_EXTRA: CryptoAsset[] = [
  { ticker: 'ALGO-USD', name: 'Algorand', category: 'crypto' },
  { ticker: 'XTZ-USD', name: 'Tezos', category: 'crypto' },
  { ticker: 'COMP-USD', name: 'Compound', category: 'crypto' },
  { ticker: 'CRV-USD', name: 'Curve DAO', category: 'crypto' },
  { ticker: 'SNX-USD', name: 'Synthetix', category: 'crypto' },
  { ticker: 'LDO-USD', name: 'Lido DAO', category: 'crypto' },
];

const KUCOIN_EXTRA: CryptoAsset[] = [
  { ticker: 'KCS-USD', name: 'KuCoin Token', category: 'crypto' },
  { ticker: 'ONDO-USD', name: 'Ondo Finance', category: 'crypto' },
  { ticker: 'JUP-USD', name: 'Jupiter', category: 'crypto' },
  { ticker: 'WLD-USD', name: 'Worldcoin', category: 'crypto' },
  { ticker: 'RNDR-USD', name: 'Render', category: 'crypto' },
];

const OKX_EXTRA: CryptoAsset[] = [
  { ticker: 'OKB-USD', name: 'OKB', category: 'crypto' },
  { ticker: 'SHIB-USD', name: 'Shiba Inu', category: 'crypto' },
  { ticker: 'ORDI-USD', name: 'ORDI', category: 'crypto' },
  { ticker: 'SATS-USD', name: 'SATS', category: 'crypto' },
  { ticker: 'SUI-USD', name: 'Sui', category: 'crypto' },
  { ticker: 'TIA-USD', name: 'Celestia', category: 'crypto' },
];

const BYBIT_EXTRA: CryptoAsset[] = [
  { ticker: 'SHIB-USD', name: 'Shiba Inu', category: 'crypto' },
  { ticker: 'PEPE-USD', name: 'Pepe', category: 'crypto' },
  { ticker: 'SUI-USD', name: 'Sui', category: 'crypto' },
  { ticker: 'TIA-USD', name: 'Celestia', category: 'crypto' },
  { ticker: 'WLD-USD', name: 'Worldcoin', category: 'crypto' },
  { ticker: 'JTO-USD', name: 'Jito', category: 'crypto' },
];

const BINGX_EXTRA: CryptoAsset[] = [
  { ticker: 'SHIB-USD', name: 'Shiba Inu', category: 'crypto' },
  { ticker: 'PEPE-USD', name: 'Pepe', category: 'crypto' },
  { ticker: 'SUI-USD', name: 'Sui', category: 'crypto' },
  { ticker: 'WIF-USD', name: 'dogwifhat', category: 'crypto' },
  { ticker: 'BONK-USD', name: 'Bonk', category: 'crypto' },
];

const BITGET_EXTRA: CryptoAsset[] = [
  { ticker: 'BGB-USD', name: 'Bitget Token', category: 'crypto' },
  { ticker: 'SHIB-USD', name: 'Shiba Inu', category: 'crypto' },
  { ticker: 'PEPE-USD', name: 'Pepe', category: 'crypto' },
  { ticker: 'SUI-USD', name: 'Sui', category: 'crypto' },
  { ticker: 'TIA-USD', name: 'Celestia', category: 'crypto' },
];

// Brasileiras focam em top-market-cap (menor variedade de altcoins)
export const BINANCE_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...BINANCE_EXTRA];
export const COINBASE_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...COINBASE_EXTRA];
export const KUCOIN_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...KUCOIN_EXTRA];
export const OKX_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...OKX_EXTRA];
export const BYBIT_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...BYBIT_EXTRA];
export const BINGX_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...BINGX_EXTRA];
export const BITGET_ASSETS: CryptoAsset[] = [...CORE_CRYPTO, ...BITGET_EXTRA];
export const MERCADO_BITCOIN_ASSETS: CryptoAsset[] = CORE_CRYPTO;
export const FOXBIT_ASSETS: CryptoAsset[] = CORE_CRYPTO;

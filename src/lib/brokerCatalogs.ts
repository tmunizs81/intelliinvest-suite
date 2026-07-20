/**
 * Registry unificado de brokers com catálogos curados.
 * Usado para auto-preencher corretora, autocompletar tickers no cadastro manual
 * e alimentar presets do importador em massa.
 */
import { AVENUE_ASSETS } from './avenueAssets';
import { XTB_ASSETS } from './xtbAssets';
import { WEBULL_ASSETS } from './webullAssets';
import { C6_ASSETS } from './c6Assets';
import { BTG_ASSETS } from './btgAssets';
import {
  BINANCE_ASSETS,
  COINBASE_ASSETS,
  KUCOIN_ASSETS,
  OKX_ASSETS,
  BYBIT_ASSETS,
  BINGX_ASSETS,
  BITGET_ASSETS,
  MERCADO_BITCOIN_ASSETS,
  FOXBIT_ASSETS,
} from './cryptoAssets';

export interface BrokerCatalogEntry {
  ticker: string;
  name: string;
  category: string;
}

export interface BrokerCatalog {
  broker: string;
  assets: BrokerCatalogEntry[];
  tickerSet: Set<string>;
  kind?: 'stock' | 'crypto';
}

export const BROKER_CATALOGS: BrokerCatalog[] = [
  { broker: 'Avenue', assets: AVENUE_ASSETS, tickerSet: new Set(AVENUE_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'stock' },
  { broker: 'XTB', assets: XTB_ASSETS, tickerSet: new Set(XTB_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'stock' },
  { broker: 'Webull', assets: WEBULL_ASSETS, tickerSet: new Set(WEBULL_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'stock' },
  { broker: 'C6 Bank', assets: C6_ASSETS, tickerSet: new Set(C6_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'stock' },
  { broker: 'BTG Pactual', assets: BTG_ASSETS, tickerSet: new Set(BTG_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'stock' },
  { broker: 'Binance', assets: BINANCE_ASSETS, tickerSet: new Set(BINANCE_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'Coinbase', assets: COINBASE_ASSETS, tickerSet: new Set(COINBASE_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'KuCoin', assets: KUCOIN_ASSETS, tickerSet: new Set(KUCOIN_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'OKX', assets: OKX_ASSETS, tickerSet: new Set(OKX_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'Bybit', assets: BYBIT_ASSETS, tickerSet: new Set(BYBIT_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'BingX', assets: BINGX_ASSETS, tickerSet: new Set(BINGX_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'Bitget', assets: BITGET_ASSETS, tickerSet: new Set(BITGET_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'Mercado Bitcoin', assets: MERCADO_BITCOIN_ASSETS, tickerSet: new Set(MERCADO_BITCOIN_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
  { broker: 'Foxbit', assets: FOXBIT_ASSETS, tickerSet: new Set(FOXBIT_ASSETS.map(a => a.ticker.toUpperCase())), kind: 'crypto' },
];

/**
 * Prioridade global de exchanges cripto quando o ticker existe em várias.
 * Ordem: volume global (Binance) → US regulada (Coinbase) → derivativos
 * (Bybit/OKX) → alt/BR (BingX/Bitget/KuCoin) → BR (Mercado Bitcoin/Foxbit).
 */
export const CRYPTO_BROKER_PRIORITY = [
  'Binance', 'Coinbase', 'Bybit', 'OKX', 'BingX', 'Bitget',
  'KuCoin', 'Mercado Bitcoin', 'Foxbit',
] as const;

export interface InferOptions {
  /** Corretoras que o usuário já possui em outros ativos — recebem preferência. */
  preferredBrokers?: string[];
}

/**
 * Retorna a corretora "dona" de um ticker.
 * - 1 catálogo → retorna direto.
 * - N catálogos → prioriza corretora já usada pelo usuário; senão aplica
 *   `CRYPTO_BROKER_PRIORITY` para cripto ou retorna null para stocks.
 */
export function inferBrokerFromTicker(
  ticker: string,
  opts: InferOptions = {},
): string | null {
  const upper = ticker.toUpperCase();
  const matches = BROKER_CATALOGS.filter(c => c.tickerSet.has(upper));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].broker;

  // Preferência: corretora que o usuário já usa
  const preferred = (opts.preferredBrokers || []).map(b => b.trim()).filter(Boolean);
  const preferredMatch = matches.find(m => preferred.includes(m.broker));
  if (preferredMatch) return preferredMatch.broker;

  // Cripto: aplica prioridade global
  if (upper.endsWith('-USD') || matches.every(m => m.kind === 'crypto')) {
    for (const b of CRYPTO_BROKER_PRIORITY) {
      if (matches.some(m => m.broker === b)) return b;
    }
  }

  // Stocks ambíguos: sem contexto suficiente
  return null;
}

/**
 * Verifica se o ticker pertence ao catálogo curado de uma corretora específica.
 * Usado para validar auto-preenchimento e alertar mismatches.
 */
export function isTickerInBroker(ticker: string, broker: string): boolean {
  const cat = BROKER_CATALOGS.find(c => c.broker === broker);
  if (!cat) return false;
  return cat.tickerSet.has(ticker.toUpperCase());
}

/** Retorna todas as corretoras que suportam o ticker (para UI de sugestão). */
export function brokersForTicker(ticker: string): string[] {
  const upper = ticker.toUpperCase();
  return BROKER_CATALOGS.filter(c => c.tickerSet.has(upper)).map(c => c.broker);
}


export interface UnifiedSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  exchangeDisplay: string;
  broker: string;
}

function categoryToType(category: string, ticker: string): { type: string; exchange: string; exchangeDisplay: string } {
  const t = ticker.toUpperCase();
  if (category === 'crypto' || t.endsWith('-USD')) return { type: 'Crypto', exchange: 'CCC', exchangeDisplay: 'Crypto' };
  if (category === 'ucits' || t.endsWith('.L')) return { type: 'ETF', exchange: 'LSE', exchangeDisplay: 'London' };
  if (t.endsWith('.DE')) return { type: 'ETF', exchange: 'GER', exchangeDisplay: 'XETRA' };
  if (t.endsWith('.AS') || t.endsWith('.PA') || t.endsWith('.SW')) return { type: 'Stock', exchange: 'EUR', exchangeDisplay: 'Euronext' };
  if (category === 'fii') return { type: 'FII', exchange: 'SAO', exchangeDisplay: 'B3' };
  if (category === 'bdr') return { type: 'BDR', exchange: 'SAO', exchangeDisplay: 'B3' };
  if (category === 'etf' && /\d{2}$/.test(t)) return { type: 'ETF', exchange: 'SAO', exchangeDisplay: 'B3' };
  if (category === 'etf' || category === 'us_etf') return { type: 'ETF', exchange: 'NMS', exchangeDisplay: 'NASDAQ' };
  if (category === 'reit') return { type: 'REIT', exchange: 'NYQ', exchangeDisplay: 'NYSE' };
  if (category === 'us_stock' || category === 'adr') return { type: 'Stock', exchange: 'NMS', exchangeDisplay: 'NASDAQ' };
  if (/\d/.test(t)) return { type: 'Ação', exchange: 'SAO', exchangeDisplay: 'B3' };
  return { type: 'Stock', exchange: 'NMS', exchangeDisplay: 'NASDAQ' };
}

/**
 * Busca local em todos os catálogos de brokers. Dedupe por ticker (prioriza primeiro match).
 */
export function searchBrokerCatalogs(query: string, limit = 12): UnifiedSearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const seen = new Map<string, UnifiedSearchResult>();
  for (const cat of BROKER_CATALOGS) {
    for (const a of cat.assets) {
      const up = a.ticker.toUpperCase();
      if (seen.has(up)) continue;
      if (up.includes(q) || a.name.toUpperCase().includes(q)) {
        const meta = categoryToType(a.category, a.ticker);
        seen.set(up, {
          symbol: a.ticker,
          name: a.name,
          type: meta.type,
          exchange: meta.exchange,
          exchangeDisplay: meta.exchangeDisplay,
          broker: cat.broker,
        });
        if (seen.size >= limit) return Array.from(seen.values());
      }
    }
  }
  return Array.from(seen.values());
}

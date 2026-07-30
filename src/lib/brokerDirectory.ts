/**
 * Diretório único de corretoras/bancos oferecidos nos seletores do app.
 * Fonte de verdade compartilhada entre cadastro de ativos, caixa e importadores
 * — evita divergências (ex.: C6 Bank existir no catálogo mas sumir da lista).
 */
import { BROKER_CATALOGS } from './brokerCatalogs';

const CURATED_BROKERS = [
  // Brasil — corretoras e bancos de investimento
  'XP Investimentos', 'Clear Corretora', 'Rico Investimentos', 'BTG Pactual',
  'Itaú Corretora', 'Bradesco Corretora', 'Banco do Brasil Investimentos',
  'C6 Bank', 'Banco Inter', 'NuInvest', 'Genial Investimentos', 'Modal Mais',
  'Ágora Investimentos', 'Toro Investimentos', 'Guide Investimentos', 'Órama',
  'Warren', 'Terra Investimentos', 'Safra Corretora', 'Santander Corretora',
  'Sofisa Direto', 'PicPay Investimentos', 'Mycap', 'Ativa Investimentos',
  // Cripto
  'Mercado Bitcoin', 'Binance', 'Foxbit', 'NovaDAX', 'Coinbase', 'KuCoin',
  'OKX', 'Bybit', 'BingX', 'Bitget',
  // Internacionais
  'Avenue Securities', 'Nomad', 'Stake', 'Passfolio', 'Interactive Brokers',
  'Charles Schwab', 'TD Ameritrade', 'XTB', 'Webull', 'eToro', 'DEGIRO',
  'Trading 212',
];

/** Lista final: curadoria + qualquer corretora com catálogo próprio. */
export const BROKER_DIRECTORY: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (b: string) => {
    const key = b.trim().toLowerCase();
    if (!b.trim() || seen.has(key)) return;
    seen.add(key);
    out.push(b.trim());
  };
  CURATED_BROKERS.forEach(push);
  BROKER_CATALOGS.forEach((c) => push(c.broker));
  return out;
})();

/** Busca tolerante a acento/caixa para os autocompletes. */
export function searchBrokers(query: string, extra: string[] = []): string[] {
  const seen = new Set(BROKER_DIRECTORY.map((b) => b.toLowerCase()));
  const all = [...BROKER_DIRECTORY, ...extra.filter((b) => b && !seen.has(b.toLowerCase()))];
  const q = query.trim().toLowerCase();
  if (!q) return all;
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nq = norm(q);
  return all.filter((b) => norm(b).includes(nq));
}

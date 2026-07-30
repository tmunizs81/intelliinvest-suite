/**
 * Isolamento de posições por (ticker, corretora).
 *
 * Regra de ouro do módulo de ativos: o mesmo ticker em corretoras diferentes
 * é SEMPRE uma posição independente. Nada aqui pode fazer fallback de uma
 * corretora para outra — isso é o que causava a "mistura" de lotes.
 */

/** Bucket para lotes sem corretora definida — nunca é fundido com outra corretora. */
export const NO_BROKER = '__SEM_CORRETORA__';

export interface HoldingLike {
  id: string;
  ticker: string;
  broker?: string | null;
  [k: string]: unknown;
}

/** Normaliza a corretora: trim + string vazia/null viram `null`. */
export function normalizeBroker(broker?: string | null): string | null {
  const b = (broker ?? '').trim();
  return b === '' ? null : b;
}

/** Rótulo exibível de uma corretora. */
export function brokerLabel(broker?: string | null): string {
  return normalizeBroker(broker) ?? 'Sem corretora';
}

/** Chave do bucket de agrupamento (nunca colide entre corretoras). */
export function brokerKey(broker?: string | null): string {
  return normalizeBroker(broker) ?? NO_BROKER;
}

/** Chave composta e estável de um lote. */
export function holdingKey(ticker: string, broker?: string | null): string {
  return `${ticker.trim().toUpperCase()}::${brokerKey(broker)}`;
}

/**
 * Encontra o lote exato de um ticker numa corretora.
 * Retorna `null` quando não existe — NUNCA devolve o lote de outra corretora.
 */
export function findHolding<T extends HoldingLike>(
  holdings: T[],
  ticker: string,
  broker?: string | null,
): T | null {
  const key = holdingKey(ticker, broker);
  return holdings.find(h => holdingKey(h.ticker, h.broker) === key) ?? null;
}

/** Resolve o id real (holdingId) de um lote — base para editar/excluir sem colisão. */
export function resolveHoldingId<T extends HoldingLike>(
  holdings: T[],
  ticker: string,
  broker?: string | null,
): string | null {
  return findHolding(holdings, ticker, broker)?.id ?? null;
}

/** Todos os lotes de um ticker, um por corretora. */
export function lotsOfTicker<T extends HoldingLike>(holdings: T[], ticker: string): T[] {
  const t = ticker.trim().toUpperCase();
  return holdings.filter(h => h.ticker.trim().toUpperCase() === t);
}

/** Agrupa por corretora preservando a ordem de chegada dentro de cada grupo. */
export function groupByBroker<T extends { broker?: string | null }>(items: T[]) {
  const map = new Map<string, T[]>();
  items.forEach(item => {
    const key = brokerKey(item.broker);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  });
  return map;
}

export interface ReconciliationGroup<T extends HoldingLike = HoldingLike> {
  ticker: string;
  lots: T[];
  /** Corretoras distintas (label) em que o ticker aparece. */
  brokers: string[];
  /** Há pelo menos um lote sem corretora definida. */
  hasUnassigned: boolean;
  /** Duplicidade real: mesmo ticker em 2+ buckets. */
  isSplit: boolean;
}

/**
 * Tickers que exigem revisão manual antes de qualquer merge automático:
 * ou estão sem corretora, ou aparecem em mais de um bucket.
 */
export function reconciliationGroups<T extends HoldingLike>(holdings: T[]): ReconciliationGroup<T>[] {
  const byTicker = new Map<string, T[]>();
  holdings.forEach(h => {
    const t = h.ticker.trim().toUpperCase();
    const arr = byTicker.get(t);
    if (arr) arr.push(h);
    else byTicker.set(t, [h]);
  });

  const out: ReconciliationGroup<T>[] = [];
  byTicker.forEach((lots, ticker) => {
    const keys = new Set(lots.map(l => brokerKey(l.broker)));
    const hasUnassigned = keys.has(NO_BROKER);
    const isSplit = keys.size > 1;
    if (!hasUnassigned && !isSplit) return;
    out.push({
      ticker,
      lots,
      brokers: Array.from(keys).map(k => (k === NO_BROKER ? 'Sem corretora' : k)),
      hasUnassigned,
      isSplit,
    });
  });

  return out.sort((a, b) => {
    if (a.hasUnassigned !== b.hasUnassigned) return a.hasUnassigned ? -1 : 1;
    return a.ticker.localeCompare(b.ticker);
  });
}

/**
 * Valida uma reatribuição de corretora: bloqueia se o destino já possui
 * um lote do mesmo ticker (violaria a unicidade user_id+ticker+broker).
 */
export function validateReassignment<T extends HoldingLike>(
  holdings: T[],
  holdingId: string,
  targetBroker: string | null,
): { ok: true } | { ok: false; reason: string } {
  const current = holdings.find(h => h.id === holdingId);
  if (!current) return { ok: false, reason: 'Posição não encontrada.' };
  const target = normalizeBroker(targetBroker);
  if (brokerKey(current.broker) === brokerKey(target)) {
    return { ok: false, reason: 'A corretora selecionada é a atual.' };
  }
  const clash = holdings.find(
    h => h.id !== holdingId && holdingKey(h.ticker, h.broker) === holdingKey(current.ticker, target),
  );
  if (clash) {
    return {
      ok: false,
      reason: `Já existe uma posição de ${current.ticker} em ${brokerLabel(target)}. Ajuste ou remova a posição existente antes de mover esta.`,
    };
  }
  return { ok: true };
}

/** URL canônica de análise de um lote — carrega corretora e id real. */
export function assetRoute(ticker: string, broker?: string | null, holdingId?: string | null): string {
  const params = new URLSearchParams();
  const b = normalizeBroker(broker);
  if (b) params.set('broker', b);
  if (holdingId) params.set('holding', holdingId);
  const qs = params.toString();
  return `/asset/${encodeURIComponent(ticker.trim().toUpperCase())}${qs ? `?${qs}` : ''}`;
}

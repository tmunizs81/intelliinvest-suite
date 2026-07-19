/**
 * Regras de mapeamento persistidas em localStorage.
 * Aprende ticker → { broker, type } sempre que o usuário confirma cadastro
 * com corretora definida, e reaplica automaticamente em cadastros/imports futuros.
 */
const STORAGE_KEY = 'ticker-mapping-rules:v1';

export interface TickerRule {
  ticker: string;
  broker?: string | null;
  type?: string | null;
  updated_at: number;
}

type RuleMap = Record<string, TickerRule>;

function read(): RuleMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RuleMap;
  } catch {
    return {};
  }
}

function write(m: RuleMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* quota */ }
}

export function getRule(ticker: string): TickerRule | null {
  if (!ticker) return null;
  const m = read();
  return m[ticker.toUpperCase()] || null;
}

export function learnRule(ticker: string, patch: Partial<Omit<TickerRule, 'ticker' | 'updated_at'>>) {
  const key = ticker.trim().toUpperCase();
  if (!key) return;
  const m = read();
  const prev = m[key] || { ticker: key, updated_at: 0 };
  const next: TickerRule = {
    ticker: key,
    broker: patch.broker !== undefined ? patch.broker : prev.broker,
    type: patch.type !== undefined ? patch.type : prev.type,
    updated_at: Date.now(),
  };
  // Só grava se houve valor útil
  if (next.broker || next.type) {
    m[key] = next;
    write(m);
  }
}

export function forgetRule(ticker: string) {
  const m = read();
  delete m[ticker.toUpperCase()];
  write(m);
}

export function listRules(): TickerRule[] {
  return Object.values(read()).sort((a, b) => b.updated_at - a.updated_at);
}

export function clearRules() {
  write({});
}

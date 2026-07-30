import { describe, it, expect } from 'vitest';
import {
  NO_BROKER,
  normalizeBroker,
  brokerKey,
  brokerLabel,
  holdingKey,
  findHolding,
  resolveHoldingId,
  lotsOfTicker,
  groupByBroker,
  reconciliationGroups,
  validateReassignment,
  assetRoute,
} from '@/lib/holdingsIsolation';

/** Mesmo ticker em 3 corretoras + 1 lote sem corretora. */
const holdings = [
  { id: 'h1', ticker: 'PETR4', broker: 'XP Investimentos', quantity: 100 },
  { id: 'h2', ticker: 'PETR4', broker: 'Clear', quantity: 50 },
  { id: 'h3', ticker: 'PETR4', broker: null, quantity: 10 },
  { id: 'h4', ticker: 'HGLG11', broker: 'XP Investimentos', quantity: 7 },
  { id: 'h5', ticker: 'VALE3', broker: 'Rico', quantity: 30 },
];

describe('normalização de corretora', () => {
  it('trata vazio, espaços e null como sem corretora', () => {
    expect(normalizeBroker('   ')).toBeNull();
    expect(normalizeBroker('')).toBeNull();
    expect(normalizeBroker(null)).toBeNull();
    expect(normalizeBroker(' Clear ')).toBe('Clear');
    expect(brokerKey(null)).toBe(NO_BROKER);
    expect(brokerLabel(null)).toBe('Sem corretora');
  });

  it('gera chaves distintas para o mesmo ticker em corretoras distintas', () => {
    expect(holdingKey('PETR4', 'XP Investimentos')).not.toBe(holdingKey('PETR4', 'Clear'));
    expect(holdingKey('petr4', ' Clear ')).toBe(holdingKey('PETR4', 'Clear'));
    expect(holdingKey('PETR4', null)).not.toBe(holdingKey('PETR4', 'Clear'));
  });
});

describe('resolução de lote por (ticker, corretora)', () => {
  it('encontra o lote exato da corretora pedida', () => {
    expect(findHolding(holdings, 'PETR4', 'Clear')?.id).toBe('h2');
    expect(findHolding(holdings, 'PETR4', 'XP Investimentos')?.id).toBe('h1');
    expect(findHolding(holdings, 'PETR4', null)?.id).toBe('h3');
  });

  it('NUNCA faz fallback para outra corretora quando não existe lote', () => {
    expect(findHolding(holdings, 'PETR4', 'BTG Pactual')).toBeNull();
    expect(findHolding(holdings, 'HGLG11', 'Clear')).toBeNull();
    expect(resolveHoldingId(holdings, 'VALE3', 'Clear')).toBeNull();
  });

  it('edição usa o holdingId real do lote selecionado', () => {
    const idXp = resolveHoldingId(holdings, 'PETR4', 'XP Investimentos');
    const idClear = resolveHoldingId(holdings, 'PETR4', 'Clear');
    expect(idXp).toBe('h1');
    expect(idClear).toBe('h2');
    expect(idXp).not.toBe(idClear);

    // simula edição de quantidade apenas no lote da Clear
    const updated = holdings.map(h => (h.id === idClear ? { ...h, quantity: 999 } : h));
    expect(updated.find(h => h.id === 'h2')!.quantity).toBe(999);
    expect(updated.find(h => h.id === 'h1')!.quantity).toBe(100);
    expect(updated.find(h => h.id === 'h3')!.quantity).toBe(10);
  });

  it('exclusão remove só o lote alvo, preservando o mesmo ticker nas outras corretoras', () => {
    const target = resolveHoldingId(holdings, 'PETR4', 'XP Investimentos')!;
    const after = holdings.filter(h => h.id !== target);
    const remaining = lotsOfTicker(after, 'PETR4');
    expect(remaining.map(h => h.id).sort()).toEqual(['h2', 'h3']);
    expect(findHolding(after, 'PETR4', 'XP Investimentos')).toBeNull();
    // HGLG11 na XP continua intocado
    expect(findHolding(after, 'HGLG11', 'XP Investimentos')?.id).toBe('h4');
  });

  it('exclusão em lote por ids não afeta lotes não selecionados', () => {
    const ids = new Set(['h2', 'h5']);
    const after = holdings.filter(h => !ids.has(h.id));
    expect(after.map(h => h.id)).toEqual(['h1', 'h3', 'h4']);
    expect(findHolding(after, 'PETR4', 'Clear')).toBeNull();
    expect(findHolding(after, 'PETR4', 'XP Investimentos')?.id).toBe('h1');
  });
});

describe('agrupamento por corretora', () => {
  it('separa buckets sem misturar tickers iguais', () => {
    const map = groupByBroker(holdings);
    expect(map.get('XP Investimentos')!.map(h => h.id)).toEqual(['h1', 'h4']);
    expect(map.get('Clear')!.map(h => h.id)).toEqual(['h2']);
    expect(map.get('Rico')!.map(h => h.id)).toEqual(['h5']);
    expect(map.get(NO_BROKER)!.map(h => h.id)).toEqual(['h3']);
  });
});

describe('reconciliação', () => {
  it('lista apenas tickers divididos ou sem corretora', () => {
    const groups = reconciliationGroups(holdings);
    expect(groups.map(g => g.ticker)).toEqual(['PETR4']);
    expect(groups[0].hasUnassigned).toBe(true);
    expect(groups[0].isSplit).toBe(true);
    expect(groups[0].lots).toHaveLength(3);
  });

  it('não sinaliza carteira já consistente', () => {
    const clean = [
      { id: 'a', ticker: 'PETR4', broker: 'XP Investimentos' },
      { id: 'b', ticker: 'VALE3', broker: 'XP Investimentos' },
    ];
    expect(reconciliationGroups(clean)).toHaveLength(0);
  });

  it('bloqueia reatribuição que colidiria com lote existente', () => {
    const res = validateReassignment(holdings, 'h3', 'Clear');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('PETR4');
  });

  it('bloqueia reatribuição para a mesma corretora', () => {
    expect(validateReassignment(holdings, 'h2', ' Clear ').ok).toBe(false);
  });

  it('permite reatribuição para corretora livre', () => {
    expect(validateReassignment(holdings, 'h3', 'BTG Pactual').ok).toBe(true);
    expect(validateReassignment(holdings, 'h5', null).ok).toBe(true);
  });
});

describe('rota de análise por lote', () => {
  it('carrega corretora e holdingId reais', () => {
    expect(assetRoute('petr4', 'Clear', 'h2')).toBe('/asset/PETR4?broker=Clear&holding=h2');
    expect(assetRoute('PETR4', null, null)).toBe('/asset/PETR4');
  });

  it('gera rotas distintas para o mesmo ticker em corretoras diferentes', () => {
    expect(assetRoute('PETR4', 'Clear', 'h2')).not.toBe(assetRoute('PETR4', 'XP Investimentos', 'h1'));
  });
});

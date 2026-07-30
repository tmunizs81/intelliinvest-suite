import { describe, it, expect } from 'vitest';
import {
  aggregateByTicker,
  aggregationKeyFor,
  assertNoPropertyMerge,
  detectPropertyMergeIssues,
  filterByClass,
  isPropertyAsset,
  sortAggregates,
  type TickerAggregate,
} from './UnifiedHoldings';
import type { Asset } from '@/lib/mockData';

function asset(over: Partial<Asset> & { ticker: string; holdingId: string }): Asset {
  return {
    holdingId: over.holdingId,
    ticker: over.ticker,
    name: over.name ?? over.ticker,
    type: over.type ?? 'Ação',
    broker: over.broker ?? 'XP',
    quantity: over.quantity ?? 1,
    avgPrice: over.avgPrice ?? 100,
    currentPrice: over.currentPrice ?? 110,
    change24h: over.change24h ?? 0,
    allocation: over.allocation ?? 10,
    currency: over.currency ?? 'BRL',
  } as Asset;
}

const properties: Asset[] = [
  asset({ holdingId: 'p1', ticker: 'IMOVEL-TERRASALP', name: 'Terras Alphaville 1', type: 'Imóvel', broker: 'TGS PATRIMONIAL', avgPrice: 1_370_000, currentPrice: 1_370_443.56, allocation: 28.8 }),
  asset({ holdingId: 'p2', ticker: 'IMOVEL-TERRASALP', name: 'Terras Alphaville 2', type: 'Imóvel', broker: 'ALPHAVILLE', avgPrice: 330_000, currentPrice: 330_141.13, allocation: 6.9 }),
  asset({ holdingId: 'p3', ticker: 'IMOVEL-TERRASALP', name: 'Terras Alphaville 3', type: 'Imóvel', broker: 'TGS HOLDINGS', avgPrice: 240_000, currentPrice: 240_077.7, allocation: 5.1 }),
];

describe('regra de agrupamento de imóveis', () => {
  it('classifica imóveis por tipo e por prefixo de ticker', () => {
    expect(isPropertyAsset({ ticker: 'IMOVEL-X', type: 'Ação' })).toBe(true);
    expect(isPropertyAsset({ ticker: 'CASA1', type: 'Imóvel' })).toBe(true);
    expect(isPropertyAsset({ ticker: 'PETR4', type: 'Ação' })).toBe(false);
  });

  it('gera chave única por posição de imóvel e chave por ticker para financeiros', () => {
    const keys = new Set(properties.map((p) => aggregationKeyFor(p)));
    expect(keys.size).toBe(3);
    expect(aggregationKeyFor(asset({ holdingId: 'a', ticker: 'petr4' }))).toBe('PETR4');
    expect(aggregationKeyFor(asset({ holdingId: 'b', ticker: 'PETR4', broker: 'Clear' }))).toBe('PETR4');
  });

  it('nunca unifica imóveis com o mesmo ticker', () => {
    const rows = aggregateByTicker(properties, []);
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r.lots).toHaveLength(1));
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  it('mantém a unificação para ativos financeiros (fungíveis)', () => {
    const rows = aggregateByTicker(
      [
        asset({ holdingId: 'f1', ticker: 'PETR4', broker: 'XP', quantity: 10, avgPrice: 30, currentPrice: 40, allocation: 4 }),
        asset({ holdingId: 'f2', ticker: 'PETR4', broker: 'Clear', quantity: 10, avgPrice: 50, currentPrice: 40, allocation: 6 }),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lots).toHaveLength(2);
    expect(rows[0].quantity).toBe(20);
    expect(rows[0].avgPrice).toBe(40);
    expect(rows[0].allocation).toBeCloseTo(10, 6);
    expect(rows[0].value).toBeCloseTo(800, 6);
  });

  it('preserva totais e percentuais por posição, sem duplicar nem subtrair', () => {
    const rows = aggregateByTicker(properties, []);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalAlloc = rows.reduce((s, r) => s + r.allocation, 0);
    const expectedValue = properties.reduce((s, p) => s + p.currentPrice * p.quantity, 0);

    expect(totalValue).toBeCloseTo(expectedValue, 6);
    expect(totalAlloc).toBeCloseTo(28.8 + 6.9 + 5.1, 6);

    rows.forEach((r) => {
      const src = properties.find((p) => p.holdingId === r.lots[0].asset.holdingId)!;
      expect(r.value).toBeCloseTo(src.currentPrice * src.quantity, 6);
      expect(r.cost).toBeCloseTo(src.avgPrice * src.quantity, 6);
      expect(r.profit).toBeCloseTo(r.value - r.cost, 6);
      expect(r.allocation).toBeCloseTo(src.allocation, 6);
    });
  });

  it('rejeita agregados inválidos com imóveis fundidos', () => {
    const bad = [{ key: 'IMOVEL-X', ticker: 'IMOVEL-X', type: 'Imóvel', lots: [{}, {}] } as unknown as TickerAggregate];
    expect(() => assertNoPropertyMerge(bad)).toThrow(/unificou/i);
  });
});

describe('ordenação com imóveis separados', () => {
  const rows = aggregateByTicker(properties, []);

  it.each(['value', 'profit', 'allocation', 'avgPrice'] as const)('ordena por %s mantendo as 3 linhas', (key) => {
    const desc = sortAggregates(rows, { key, dir: 'desc' });
    const asc = sortAggregates(rows, { key, dir: 'asc' });
    expect(desc).toHaveLength(3);
    expect(new Set(desc.map((r) => r.key)).size).toBe(3);
    const vals = desc.map((r) => r[key] as number);
    expect([...vals].sort((a, b) => b - a)).toEqual(vals);
    expect(asc.map((r) => r.key)).toEqual([...desc].reverse().map((r) => r.key));
  });

  it('desempata de forma estável pela chave única', () => {
    const tied = aggregateByTicker(
      properties.map((p) => ({ ...p, currentPrice: 100, avgPrice: 100, quantity: 1 })),
      [],
    );
    const a = sortAggregates(tied, { key: 'value', dir: 'desc' }).map((r) => r.key);
    const b = sortAggregates([...tied].reverse(), { key: 'value', dir: 'desc' }).map((r) => r.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });
});

describe('filtro de classe e aviso de fusão', () => {
  const mixed: Asset[] = [
    ...properties,
    asset({ holdingId: 'f1', ticker: 'PETR4', type: 'Ação' }),
    asset({ holdingId: 'f2', ticker: 'HGLG11', type: 'FII' }),
  ];

  it('separa imóveis de ativos financeiros', () => {
    expect(filterByClass(mixed, 'all')).toHaveLength(5);
    expect(filterByClass(mixed, 'property').map((a) => a.holdingId)).toEqual(['p1', 'p2', 'p3']);
    expect(filterByClass(mixed, 'financial').map((a) => a.holdingId)).toEqual(['f1', 'f2']);
  });

  it('não reporta problema quando imóveis estão separados', () => {
    expect(detectPropertyMergeIssues(aggregateByTicker(mixed, []))).toEqual([]);
  });

  it('detecta (sem lançar) imóveis unificados', () => {
    const bad = [{ ...aggregateByTicker(properties, [])[0] }] as TickerAggregate[];
    bad[0].lots = [bad[0].lots[0], bad[0].lots[0]];
    const issues = detectPropertyMergeIssues(bad);
    expect(issues).toEqual([{ ticker: 'IMOVEL-TERRASALP', lots: 2 }]);
    expect(() => detectPropertyMergeIssues(bad)).not.toThrow();
  });
});

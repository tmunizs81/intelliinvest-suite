import { useMemo, useState, memo } from 'react';
import {
  ChevronRight, ChevronDown, Pencil, Trash2, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';
import { BrokerLogo } from '@/lib/brokerLogos';
import { NO_BROKER } from '@/lib/holdingsIsolation';

/* ------------------------------------------------------------------ *
 * Modelo de apresentação
 * Um ticker = uma linha. Cada lote (corretora) continua sendo uma
 * entidade independente — nada aqui funde ids, apenas soma para exibir.
 * ------------------------------------------------------------------ */

export interface TickerLot {
  asset: Asset;
  holdingRow?: HoldingRow;
  broker: string;
  brokerLabel: string;
  quantity: number;
  avgPrice: number;
  value: number;
  cost: number;
  profit: number;
  profitPct: number;
  allocation: number;
}

export interface TickerAggregate {
  ticker: string;
  name: string;
  type: string;
  currency?: string;
  originalPrice?: number;
  currentPrice: number;
  change24h: number;
  quantity: number;
  avgPrice: number;
  value: number;
  cost: number;
  profit: number;
  profitPct: number;
  allocation: number;
  lots: TickerLot[];
  ids: string[];
}

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary ring-primary/20',
  'FII': 'bg-[hsl(270,70%,60%)]/10 text-[hsl(270,70%,78%)] ring-[hsl(270,70%,60%)]/20',
  'ETF': 'bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,72%)] ring-[hsl(38,92%,50%)]/20',
  'ETF Internacional': 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  'Cripto': 'bg-[hsl(160,84%,39%)]/10 text-[hsl(160,84%,72%)] ring-[hsl(160,84%,39%)]/20',
  'Renda Fixa': 'bg-secondary text-secondary-foreground ring-border',
  'Imóvel': 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
};

const typeShort: Record<string, string> = {
  'ETF Internacional': 'ETF Int.',
  'Renda Fixa': 'R. Fixa',
};

/** Grade única compartilhada por cabeçalho, linhas e sub-linhas. */
const GRID =
  'grid grid-cols-[28px_minmax(190px,1.6fr)_88px_minmax(84px,0.7fr)_minmax(96px,0.8fr)_minmax(104px,0.9fr)_76px_minmax(112px,1fr)_minmax(112px,1fr)_92px_84px] items-center gap-x-3';

function num(n: number, digits = 8) {
  // Evita "0.52314961" ocupando meia tela: corta zeros à direita.
  const s = n.toFixed(digits).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))] rounded border-border"
    />
  );
}

/** Pilha de logos das corretoras que custodiam o ticker. */
function BrokerStack({ lots, max = 3 }: { lots: TickerLot[]; max?: number }) {
  const real = lots.filter((l) => l.broker !== NO_BROKER);
  const extra = real.length - max;
  return (
    <span className="flex items-center">
      {real.slice(0, max).map((l, i) => (
        <span
          key={l.broker}
          className="rounded-full ring-2 ring-card bg-card"
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: max - i }}
          title={l.brokerLabel}
        >
          <BrokerLogo broker={l.broker} size={16} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="ml-[-6px] flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold text-muted-foreground ring-2 ring-card"
          title={real.slice(max).map((l) => l.brokerLabel).join(', ')}
        >
          +{extra}
        </span>
      )}
      {real.length === 0 && <span className="text-[10px] text-muted-foreground/60">—</span>}
    </span>
  );
}

/** Barra fina de alocação: leitura instantânea do peso na carteira. */
function AllocationCell({ pct }: { pct: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {pct.toFixed(pct < 1 && pct > 0 ? 2 : 1)}%
      </span>
      <span className="h-[3px] w-12 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${Math.min(100, Math.max(pct, pct > 0 ? 3 : 0))}%` }}
        />
      </span>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
        up ? 'text-gain' : 'text-loss'
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {formatPercent(value)}
    </span>
  );
}

function RowActions({
  holdingRow,
  onSell,
  onEdit,
  onDelete,
  compact,
}: {
  holdingRow?: HoldingRow;
  onSell: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  if (!holdingRow) return <span />;
  return (
    <div
      className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onSell}
        title="Vender"
        className={`flex items-center justify-center rounded-md text-[hsl(var(--loss-foreground))] hover:bg-[hsl(var(--loss)/0.15)] transition-colors ${
          compact ? 'h-6 w-6' : 'h-7 w-7'
        }`}
      >
        <ArrowDownRight className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onEdit}
        title="Editar"
        className={`flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ${
          compact ? 'h-6 w-6' : 'h-7 w-7'
        }`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        title="Remover"
        className={`flex items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--loss)/0.12)] hover:text-[hsl(var(--loss-foreground))] transition-colors ${
          compact ? 'h-6 w-6' : 'h-7 w-7'
        }`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Linha agregada (um ticker)
 * ------------------------------------------------------------------ */

interface RowProps {
  agg: TickerAggregate;
  expanded: boolean;
  onToggleExpand: () => void;
  selected: Set<string>;
  onToggleIds: (ids: string[], select: boolean) => void;
  onOpen: (asset: Asset) => void;
  onEdit: (h: HoldingRow) => void;
  onSell: (h: HoldingRow, a: Asset) => void;
  onDelete: (id: string) => void;
  showBrokerColumn: boolean;
}

const TickerRow = memo(function TickerRow({
  agg, expanded, onToggleExpand, selected, onToggleIds, onOpen, onEdit, onSell, onDelete, showBrokerColumn,
}: RowProps) {
  const allSelected = agg.ids.length > 0 && agg.ids.every((id) => selected.has(id));
  const someSelected = !allSelected && agg.ids.some((id) => selected.has(id));
  const multi = agg.lots.length > 1;
  const single = agg.lots[0];
  const hasPrice = agg.currentPrice > 0;

  return (
    <>
      <div
        className={`group ${GRID} cursor-pointer border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-accent/40 ${
          allSelected || someSelected ? 'bg-primary/[0.06]' : ''
        }`}
        onClick={() => onOpen(single.asset)}
      >
        {/* seleção */}
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <span className={allSelected || someSelected ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'}>
            <Checkbox
              checked={allSelected}
              onChange={() => onToggleIds(agg.ids, !allSelected)}
              label={`Selecionar ${agg.ticker}`}
            />
          </span>
        </div>

        {/* ativo */}
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={(e) => { e.stopPropagation(); if (multi) onToggleExpand(); }}
            aria-label={multi ? 'Expandir corretoras' : undefined}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
              multi ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'pointer-events-none opacity-0'
            }`}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-[13px] font-semibold tracking-tight">{agg.ticker}</span>
              {showBrokerColumn && multi && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {agg.lots.length} corretoras
                </span>
              )}
            </div>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{agg.name}</p>
          </div>
          {showBrokerColumn && <span className="ml-auto shrink-0"><BrokerStack lots={agg.lots} /></span>}
        </div>

        {/* tipo */}
        <div>
          <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${typeBadgeClass[agg.type] || 'bg-muted text-muted-foreground ring-border'}`}>
            {typeShort[agg.type] || agg.type}
          </span>
        </div>

        {/* qtd */}
        <div className="truncate text-right font-mono text-[12px] tabular-nums" title={num(agg.quantity)}>
          {num(agg.quantity)}
        </div>

        {/* PM */}
        <div className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
          {formatCurrency(agg.avgPrice)}
        </div>

        {/* atual */}
        <div className="text-right">
          {hasPrice ? (
            <>
              <div className="font-mono text-[12px] font-medium tabular-nums">{formatCurrency(agg.currentPrice)}</div>
              {agg.currency && agg.currency !== 'BRL' && !!agg.originalPrice && (
                <div className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {formatCurrency(agg.originalPrice, agg.currency)}
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* 24h */}
        <div className="text-right">{hasPrice ? <Delta value={agg.change24h} /> : <span className="text-muted-foreground">—</span>}</div>

        {/* total */}
        <div className="text-right font-mono text-[12px] font-semibold tabular-nums">
          {hasPrice ? formatCurrency(agg.value) : '—'}
        </div>

        {/* lucro */}
        <div className={`text-right font-mono text-[12px] tabular-nums ${agg.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
          {hasPrice ? (
            <>
              <div className="font-medium">{formatCurrency(agg.profit)}</div>
              <div className="text-[10px] opacity-80">{formatPercent(agg.profitPct)}</div>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* alocação */}
        <div className="flex justify-end"><AllocationCell pct={agg.allocation} /></div>

        {/* ações — só para lote único; multi-lote age nas sub-linhas */}
        <div>
          {multi ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              className="ml-auto flex h-7 items-center justify-end rounded-md px-2 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
            >
              {expanded ? 'Fechar' : 'Detalhar'}
            </button>
          ) : (
            <RowActions
              holdingRow={single.holdingRow}
              onSell={() => single.holdingRow && onSell(single.holdingRow, single.asset)}
              onEdit={() => single.holdingRow && onEdit(single.holdingRow)}
              onDelete={() => single.holdingRow && onDelete(single.holdingRow.id)}
            />
          )}
        </div>
      </div>

      {/* sub-linhas por corretora */}
      {expanded && multi && (
        <div className="border-b border-border/40 bg-muted/20">
          {agg.lots.map((lot) => {
            const id = lot.asset.holdingId;
            const isSel = !!id && selected.has(id);
            return (
              <div
                key={id || `${agg.ticker}::${lot.broker}`}
                className={`group ${GRID} cursor-pointer border-t border-border/25 px-4 py-2 transition-colors hover:bg-accent/40 ${isSel ? 'bg-primary/[0.06]' : ''}`}
                onClick={() => onOpen(lot.asset)}
              >
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <span className={isSel ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'}>
                    <Checkbox
                      checked={isSel}
                      onChange={() => id && onToggleIds([id], !isSel)}
                      label={`Selecionar ${agg.ticker} em ${lot.brokerLabel}`}
                    />
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-2 pl-7">
                  <span className="h-3 w-3 shrink-0 rounded-bl border-b border-l border-border/60" />
                  {lot.broker !== NO_BROKER && <BrokerLogo broker={lot.broker} size={15} />}
                  <span className="truncate text-[11px] text-muted-foreground">{lot.brokerLabel}</span>
                </div>

                <div />
                <div className="truncate text-right font-mono text-[11px] tabular-nums text-muted-foreground">{num(lot.quantity)}</div>
                <div className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">{formatCurrency(lot.avgPrice)}</div>
                <div />
                <div />
                <div className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {lot.value > 0 ? formatCurrency(lot.value) : '—'}
                </div>
                <div className={`text-right font-mono text-[11px] tabular-nums ${lot.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {lot.value > 0 ? `${formatCurrency(lot.profit)} (${formatPercent(lot.profitPct)})` : '—'}
                </div>
                <div className="text-right font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {lot.allocation.toFixed(lot.allocation < 1 && lot.allocation > 0 ? 2 : 1)}%
                </div>
                <RowActions
                  compact
                  holdingRow={lot.holdingRow}
                  onSell={() => lot.holdingRow && onSell(lot.holdingRow, lot.asset)}
                  onEdit={() => lot.holdingRow && onEdit(lot.holdingRow)}
                  onDelete={() => lot.holdingRow && onDelete(lot.holdingRow.id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

/* ------------------------------------------------------------------ *
 * Agregação
 * ------------------------------------------------------------------ */

export function aggregateByTicker(assets: Asset[], holdings: HoldingRow[]): TickerAggregate[] {
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const map = new Map<string, TickerAggregate>();

  assets.forEach((a) => {
    const key = a.ticker.trim().toUpperCase();
    const broker = (a.broker || '').trim() || NO_BROKER;
    const value = a.currentPrice * a.quantity;
    const cost = a.avgPrice * a.quantity;
    const lot: TickerLot = {
      asset: a,
      holdingRow: a.holdingId ? byId.get(a.holdingId) : undefined,
      broker,
      brokerLabel: broker === NO_BROKER ? 'Sem corretora' : broker,
      quantity: a.quantity,
      avgPrice: a.avgPrice,
      value,
      cost,
      profit: value - cost,
      profitPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      allocation: Number(a.allocation) || 0,
    };

    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        ticker: key,
        name: a.name,
        type: a.type,
        currency: a.currency,
        originalPrice: a.originalPrice,
        currentPrice: a.currentPrice,
        change24h: a.change24h || 0,
        quantity: a.quantity,
        avgPrice: a.avgPrice,
        value,
        cost,
        profit: value - cost,
        profitPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
        allocation: lot.allocation,
        lots: [lot],
        ids: a.holdingId ? [a.holdingId] : [],
      });
      return;
    }
    cur.quantity += a.quantity;
    cur.value += value;
    cur.cost += cost;
    cur.profit = cur.value - cur.cost;
    cur.profitPct = cur.cost > 0 ? (cur.profit / cur.cost) * 100 : 0;
    cur.avgPrice = cur.quantity > 0 ? cur.cost / cur.quantity : 0;
    cur.allocation += lot.allocation;
    if (!cur.currentPrice && a.currentPrice) {
      cur.currentPrice = a.currentPrice;
      cur.change24h = a.change24h || 0;
    }
    cur.lots.push(lot);
    if (a.holdingId) cur.ids.push(a.holdingId);
  });

  map.forEach((agg) => agg.lots.sort((x, y) => y.value - x.value));
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ *
 * Componente principal
 * ------------------------------------------------------------------ */

export type AssetsViewMode = 'ticker' | 'broker';

interface Props {
  assets: Asset[];
  holdings: HoldingRow[];
  viewMode: AssetsViewMode;
  selected: Set<string>;
  onToggleIds: (ids: string[], select: boolean) => void;
  onOpen: (asset: Asset) => void;
  onEdit: (h: HoldingRow) => void;
  onSell: (h: HoldingRow, a: Asset) => void;
  onDelete: (id: string) => void;
  brokerFilter: string;
  onBrokerFilter: (b: string) => void;
}

export default function UnifiedHoldings({
  assets, holdings, viewMode, selected, onToggleIds, onOpen, onEdit, onSell, onDelete, brokerFilter, onBrokerFilter,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedBrokers, setCollapsedBrokers] = useState<Set<string>>(new Set());

  const toggleExpand = (t: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const aggregates = useMemo(() => {
    const list = aggregateByTicker(assets, holdings);
    return list.sort((a, b) => b.value - a.value);
  }, [assets, holdings]);

  const brokerGroups = useMemo(() => {
    if (viewMode !== 'broker') return [];
    const map = new Map<string, Asset[]>();
    assets.forEach((a) => {
      const key = (a.broker || '').trim() || NO_BROKER;
      const arr = map.get(key);
      if (arr) arr.push(a); else map.set(key, [a]);
    });
    return Array.from(map.entries())
      .map(([broker, items]) => {
        const rows = aggregateByTicker(items, holdings).sort((x, y) => y.value - x.value);
        const value = rows.reduce((s, r) => s + r.value, 0);
        const cost = rows.reduce((s, r) => s + r.cost, 0);
        return {
          broker,
          label: broker === NO_BROKER ? 'Sem corretora' : broker,
          rows,
          value,
          cost,
          gain: value - cost,
          ids: rows.flatMap((r) => r.ids),
        };
      })
      .sort((a, b) => (a.broker === NO_BROKER ? 1 : b.broker === NO_BROKER ? -1 : b.value - a.value));
  }, [assets, holdings, viewMode]);

  const header = (
    <div className={`${GRID} sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur`}>
      <div />
      <div>Ativo</div>
      <div>Tipo</div>
      <div className="text-right">Qtd</div>
      <div className="text-right">PM</div>
      <div className="text-right">Atual</div>
      <div className="text-right">24h</div>
      <div className="text-right">Total</div>
      <div className="text-right">Lucro</div>
      <div className="text-right">Aloc.</div>
      <div />
    </div>
  );

  const rowProps = {
    selected, onToggleIds, onOpen, onEdit, onSell, onDelete,
  };

  return (
    <div className="min-w-[1100px]">
      {header}

      {viewMode === 'ticker' &&
        aggregates.map((agg) => (
          <TickerRow
            key={agg.ticker}
            agg={agg}
            expanded={expanded.has(agg.ticker)}
            onToggleExpand={() => toggleExpand(agg.ticker)}
            showBrokerColumn
            {...rowProps}
          />
        ))}

      {viewMode === 'broker' &&
        brokerGroups.map((g) => {
          const isCollapsed = collapsedBrokers.has(g.broker);
          const allSel = g.ids.length > 0 && g.ids.every((id) => selected.has(id));
          return (
            <div key={g.broker}>
              <div className="flex items-center gap-2.5 border-y border-border/60 bg-muted/40 px-4 py-2">
                <span className={allSel ? '' : 'opacity-60'}>
                  <Checkbox checked={allSel} onChange={() => onToggleIds(g.ids, !allSel)} label={`Selecionar tudo de ${g.label}`} />
                </span>
                <button
                  onClick={() =>
                    setCollapsedBrokers((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.broker)) next.delete(g.broker); else next.add(g.broker);
                      return next;
                    })
                  }
                  className="flex items-center gap-2 text-[12px] font-semibold transition-colors hover:text-primary"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  {g.broker !== NO_BROKER && <BrokerLogo broker={g.broker} size={16} />}
                  {g.label}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {g.rows.length} {g.rows.length === 1 ? 'ativo' : 'ativos'}
                  </span>
                </button>
                <div className="ml-auto flex items-center gap-3 font-mono text-[11px] tabular-nums">
                  <span className="text-muted-foreground">{formatCurrency(g.value)}</span>
                  <span className={g.gain >= 0 ? 'text-gain' : 'text-loss'}>
                    {formatCurrency(g.gain)} ({formatPercent(g.cost > 0 ? (g.gain / g.cost) * 100 : 0)})
                  </span>
                  {g.broker !== NO_BROKER && (
                    <button
                      onClick={() => onBrokerFilter(brokerFilter === g.broker ? '' : g.broker)}
                      className="rounded-full border border-border px-2 py-0.5 font-sans text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {brokerFilter === g.broker ? 'Limpar' : 'Ver só esta'}
                    </button>
                  )}
                </div>
              </div>
              {!isCollapsed &&
                g.rows.map((agg) => (
                  <TickerRow
                    key={`${g.broker}::${agg.ticker}`}
                    agg={agg}
                    expanded={false}
                    onToggleExpand={() => {}}
                    showBrokerColumn={false}
                    {...rowProps}
                  />
                ))}
            </div>
          );
        })}
    </div>
  );
}

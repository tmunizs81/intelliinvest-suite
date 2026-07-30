import { useMemo, useState, useEffect, useCallback, memo, type KeyboardEvent, type ReactNode } from 'react';
import {
  ChevronRight, ChevronDown, Pencil, Trash2, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown,
} from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';
import { BrokerLogo } from '@/lib/brokerLogos';
import { NO_BROKER } from '@/lib/holdingsIsolation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  /** Chave única do agrupamento (imóveis nunca são fundidos entre si). */
  key: string;
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

const FOCUS_RING =
  'focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

/* ------------------------------------------------------------------ *
 * Ordenação persistida
 * ------------------------------------------------------------------ */

export type SortKey = 'value' | 'profit' | 'allocation' | 'avgPrice' | 'ticker' | 'change24h';
export type SortDir = 'asc' | 'desc';
export interface SortState { key: SortKey; dir: SortDir }

const SORT_STORAGE_KEY = 'assets:sort:v1';
const DEFAULT_SORT: SortState = { key: 'value', dir: 'desc' };

export function loadSortState(): SortState {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SORT_STORAGE_KEY) : null;
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    const keys: SortKey[] = ['value', 'profit', 'allocation', 'avgPrice', 'ticker', 'change24h'];
    if (!parsed.key || !keys.includes(parsed.key)) return DEFAULT_SORT;
    return { key: parsed.key, dir: parsed.dir === 'asc' ? 'asc' : 'desc' };
  } catch {
    return DEFAULT_SORT;
  }
}

export const SORT_LABELS: Record<SortKey, string> = {
  value: 'Valor',
  profit: 'Lucro',
  allocation: 'Alocação',
  avgPrice: 'Preço médio',
  change24h: 'Variação 24h',
  ticker: 'Ticker',
};

export function sortAggregates(list: TickerAggregate[], sort: SortState): TickerAggregate[] {
  const mult = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort.key === 'ticker') {
      const t = a.ticker.localeCompare(b.ticker) * mult;
      return t !== 0 ? t : a.key.localeCompare(b.key);
    }
    const va = a[sort.key] as number;
    const vb = b[sort.key] as number;
    if (va === vb) {
      // Imóveis homônimos: desempate estável e determinístico pela chave única.
      const t = a.ticker.localeCompare(b.ticker);
      return t !== 0 ? t : a.key.localeCompare(b.key);
    }
    return (va - vb) * mult;
  });
}

function num(n: number, digits = 8) {
  // Evita "0.52314961" ocupando meia tela: corta zeros à direita.
  const s = n.toFixed(digits).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

function pctLabel(p: number) {
  return `${p.toFixed(p < 1 && p > 0 ? 2 : 1)}%`;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className={`h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))] rounded border-border ${FOCUS_RING}`}
    />
  );
}

/** Tooltip acessível para números: explica o cálculo sem expandir a linha. */
function Info({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          className={`inline-block cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 ${FOCUS_RING}`}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="max-w-[260px] text-[11px] leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function BrokerBreakdownTip({ agg }: { agg: TickerAggregate }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold">Distribuição por corretora</p>
      {agg.lots.map((l) => (
        <div key={l.broker} className="flex items-center justify-between gap-3 font-mono tabular-nums">
          <span className="truncate">{l.brokerLabel}</span>
          <span>
            {num(l.quantity, 6)} un • {agg.value > 0 ? pctLabel((l.value / agg.value) * 100) : '—'}
          </span>
        </div>
      ))}
      <p className="pt-1 font-mono tabular-nums text-muted-foreground">
        Total {num(agg.quantity, 6)} un • {formatCurrency(agg.value)}
      </p>
    </div>
  );
}

/** Pilha de logos das corretoras que custodiam o ticker. */
function BrokerStack({ agg, max = 3 }: { agg: TickerAggregate; max?: number }) {
  const real = agg.lots.filter((l) => l.broker !== NO_BROKER);
  const extra = real.length - max;
  if (real.length === 0) return <span className="text-[10px] text-muted-foreground/60">—</span>;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Corretoras de ${agg.ticker}`}
          className={`flex cursor-help items-center rounded-full ${FOCUS_RING}`}
        >
          {real.slice(0, max).map((l, i) => (
            <span key={l.broker} className="rounded-full ring-2 ring-card bg-card" style={{ marginLeft: i === 0 ? 0 : -6, zIndex: max - i }}>
              <BrokerLogo broker={l.broker} size={16} />
            </span>
          ))}
          {extra > 0 && (
            <span className="ml-[-6px] flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
              +{extra}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-[11px]">
        <BrokerBreakdownTip agg={agg} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Barra fina de alocação: leitura instantânea do peso na carteira. */
function AllocationCell({ pct, tip }: { pct: number; tip: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <Info tip={tip}>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pctLabel(pct)}</span>
      </Info>
      <span
        className="h-[3px] w-12 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={Number(pct.toFixed(2))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Alocação na carteira"
      >
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
    <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${up ? 'text-gain' : 'text-loss'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
      {formatPercent(value)}
    </span>
  );
}

function RowActions({
  holdingRow, label, onSell, onEdit, onDelete, compact, alwaysVisible,
}: {
  holdingRow?: HoldingRow;
  label: string;
  onSell: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
  alwaysVisible?: boolean;
}) {
  if (!holdingRow) return <span />;
  const size = compact ? 'h-6 w-6' : 'h-7 w-7';
  return (
    <div
      className={`flex items-center justify-end gap-0.5 transition-opacity ${
        alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onSell}
        title={`Vender ${label}`}
        aria-label={`Vender ${label}`}
        className={`flex items-center justify-center rounded-md text-[hsl(var(--loss-foreground))] transition-colors hover:bg-[hsl(var(--loss)/0.15)] ${size} ${FOCUS_RING}`}
      >
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        onClick={onEdit}
        title={`Editar ${label}`}
        aria-label={`Editar ${label}`}
        className={`flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${size} ${FOCUS_RING}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        onClick={onDelete}
        title={`Remover ${label}`}
        aria-label={`Remover ${label}`}
        className={`flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--loss)/0.12)] hover:text-[hsl(var(--loss-foreground))] ${size} ${FOCUS_RING}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Teclado: Enter/Espaço/Setas em qualquer linha
 * ------------------------------------------------------------------ */

function useRowKeys({
  onOpen, onSelect, onExpand, onCollapse,
}: { onOpen: () => void; onSelect: () => void; onExpand?: () => void; onCollapse?: () => void }) {
  return useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'Enter':
        e.preventDefault(); onOpen(); break;
      case ' ':
      case 'Spacebar':
        e.preventDefault(); onSelect(); break;
      case 'ArrowRight':
        if (onExpand) { e.preventDefault(); onExpand(); }
        break;
      case 'ArrowLeft':
        if (onCollapse) { e.preventDefault(); onCollapse(); }
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        const rows = Array.from(
          (e.currentTarget.closest('[data-holdings-root]') as HTMLElement | null)?.querySelectorAll<HTMLElement>('[data-holdings-row]') ?? [],
        );
        const i = rows.indexOf(e.currentTarget);
        const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) { e.preventDefault(); next.focus(); }
        break;
      }
    }
  }, [onOpen, onSelect, onExpand, onCollapse]);
}

/* ------------------------------------------------------------------ *
 * Linha agregada (um ticker) — desktop
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

  const onKeyDown = useRowKeys({
    onOpen: () => onOpen(single.asset),
    onSelect: () => onToggleIds(agg.ids, !allSelected),
    onExpand: multi && !expanded ? onToggleExpand : undefined,
    onCollapse: multi && expanded ? onToggleExpand : undefined,
  });

  return (
    <>
      <div
        data-holdings-row
        data-agg-key={agg.key}
        role="row"
        tabIndex={0}
        aria-selected={allSelected}
        aria-expanded={multi ? expanded : undefined}
        aria-label={`${agg.ticker}, ${agg.name}, total ${formatCurrency(agg.value)}`}
        onKeyDown={onKeyDown}
        className={`group ${GRID} ${FOCUS_RING} cursor-pointer border-b border-border/40 px-4 py-2.5 transition-colors hover:bg-accent/40 ${
          allSelected || someSelected ? 'bg-primary/[0.06]' : ''
        }`}
        onClick={() => onOpen(single.asset)}
      >
        {/* seleção */}
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <span className={allSelected || someSelected ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'}>
            <Checkbox checked={allSelected} onChange={() => onToggleIds(agg.ids, !allSelected)} label={`Selecionar ${agg.ticker}`} />
          </span>
        </div>

        {/* ativo */}
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={(e) => { e.stopPropagation(); if (multi) onToggleExpand(); }}
            aria-label={multi ? `${expanded ? 'Recolher' : 'Expandir'} corretoras de ${agg.ticker}` : undefined}
            aria-expanded={multi ? expanded : undefined}
            tabIndex={multi ? 0 : -1}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${FOCUS_RING} ${
              multi ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'pointer-events-none opacity-0'
            }`}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
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
          {showBrokerColumn && <span className="ml-auto shrink-0"><BrokerStack agg={agg} /></span>}
        </div>

        {/* tipo */}
        <div>
          <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${typeBadgeClass[agg.type] || 'bg-muted text-muted-foreground ring-border'}`}>
            {typeShort[agg.type] || agg.type}
          </span>
        </div>

        {/* qtd */}
        <div className="truncate text-right font-mono text-[12px] tabular-nums">
          {multi ? (
            <Info tip={<BrokerBreakdownTip agg={agg} />}>{num(agg.quantity)}</Info>
          ) : (
            <span title={num(agg.quantity)}>{num(agg.quantity)}</span>
          )}
        </div>

        {/* PM */}
        <div className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
          <Info
            tip={
              <div className="space-y-1">
                <p className="font-semibold">Preço médio ponderado</p>
                <p>Custo total ÷ quantidade total{multi ? ', somando todos os lotes/corretoras.' : '.'}</p>
                <p className="font-mono tabular-nums">
                  {formatCurrency(agg.cost)} ÷ {num(agg.quantity, 6)} = {formatCurrency(agg.avgPrice)}
                </p>
              </div>
            }
          >
            {formatCurrency(agg.avgPrice)}
          </Info>
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
        <div className="text-right">
          {hasPrice ? (
            <Info
              tip={
                <div className="space-y-1">
                  <p className="font-semibold">Variação 24h</p>
                  <p>Preço atual vs. fechamento anterior.</p>
                  <p className="font-mono tabular-nums">
                    Impacto na posição: {formatCurrency((agg.value * agg.change24h) / 100)}
                  </p>
                </div>
              }
            >
              <Delta value={agg.change24h} />
            </Info>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* total */}
        <div className="text-right font-mono text-[12px] font-semibold tabular-nums">
          {hasPrice ? formatCurrency(agg.value) : '—'}
        </div>

        {/* lucro */}
        <div className={`text-right font-mono text-[12px] tabular-nums ${agg.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
          {hasPrice ? (
            <Info
              tip={
                <div className="space-y-1">
                  <p className="font-semibold">Lucro não realizado</p>
                  <p className="font-mono tabular-nums">Valor atual {formatCurrency(agg.value)}</p>
                  <p className="font-mono tabular-nums">Custo total {formatCurrency(agg.cost)}</p>
                  <p className="font-mono tabular-nums">
                    Resultado {formatCurrency(agg.profit)} ({formatPercent(agg.profitPct)})
                  </p>
                  <p className="text-muted-foreground">Não inclui proventos nem custos operacionais.</p>
                </div>
              }
            >
              <span className="font-medium">{formatCurrency(agg.profit)}</span>
              <span className="block text-[10px] opacity-80">{formatPercent(agg.profitPct)}</span>
            </Info>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>

        {/* alocação */}
        <div className="flex justify-end">
          <AllocationCell
            pct={agg.allocation}
            tip={
              <div className="space-y-1">
                <p className="font-semibold">Alocação na carteira</p>
                <p className="font-mono tabular-nums">
                  {formatCurrency(agg.value)} = {pctLabel(agg.allocation)} do patrimônio investido.
                </p>
                {multi && <BrokerBreakdownTip agg={agg} />}
              </div>
            }
          />
        </div>

        {/* ações — só para lote único; multi-lote age nas sub-linhas */}
        <div>
          {multi ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              aria-expanded={expanded}
              className={`ml-auto flex h-7 items-center justify-end rounded-md px-2 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS_RING}`}
            >
              {expanded ? 'Fechar' : 'Detalhar'}
            </button>
          ) : (
            <RowActions
              label={agg.ticker}
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
              <LotRow
                key={id || `${agg.ticker}::${lot.broker}`}
                agg={agg}
                lot={lot}
                isSel={isSel}
                onToggleIds={onToggleIds}
                onOpen={onOpen}
                onEdit={onEdit}
                onSell={onSell}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </>
  );
});

function LotRow({
  agg, lot, isSel, onToggleIds, onOpen, onEdit, onSell, onDelete,
}: {
  agg: TickerAggregate;
  lot: TickerLot;
  isSel: boolean;
  onToggleIds: (ids: string[], select: boolean) => void;
  onOpen: (a: Asset) => void;
  onEdit: (h: HoldingRow) => void;
  onSell: (h: HoldingRow, a: Asset) => void;
  onDelete: (id: string) => void;
}) {
  const id = lot.asset.holdingId;
  const onKeyDown = useRowKeys({
    onOpen: () => onOpen(lot.asset),
    onSelect: () => id && onToggleIds([id], !isSel),
  });

  return (
    <div
      data-holdings-row
      role="row"
      tabIndex={0}
      aria-selected={isSel}
      aria-label={`${agg.ticker} em ${lot.brokerLabel}`}
      onKeyDown={onKeyDown}
      className={`group ${GRID} ${FOCUS_RING} cursor-pointer border-t border-border/25 px-4 py-2 transition-colors hover:bg-accent/40 ${isSel ? 'bg-primary/[0.06]' : ''}`}
      onClick={() => onOpen(lot.asset)}
    >
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <span className={isSel ? '' : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'}>
          <Checkbox checked={isSel} onChange={() => id && onToggleIds([id], !isSel)} label={`Selecionar ${agg.ticker} em ${lot.brokerLabel}`} />
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2 pl-7">
        <span className="h-3 w-3 shrink-0 rounded-bl border-b border-l border-border/60" aria-hidden />
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
      <div className="text-right font-mono text-[10px] tabular-nums text-muted-foreground/70">{pctLabel(lot.allocation)}</div>
      <RowActions
        compact
        label={`${agg.ticker} em ${lot.brokerLabel}`}
        holdingRow={lot.holdingRow}
        onSell={() => lot.holdingRow && onSell(lot.holdingRow, lot.asset)}
        onEdit={() => lot.holdingRow && onEdit(lot.holdingRow)}
        onDelete={() => lot.holdingRow && onDelete(lot.holdingRow.id)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cartão "table-like" — mobile
 * ------------------------------------------------------------------ */

function MobileCard({
  agg, expanded, onToggleExpand, selected, onToggleIds, onOpen, onEdit, onSell, onDelete, showBrokers,
}: RowProps & { showBrokers: boolean }) {
  const allSelected = agg.ids.length > 0 && agg.ids.every((id) => selected.has(id));
  const someSelected = !allSelected && agg.ids.some((id) => selected.has(id));
  const multi = agg.lots.length > 1;
  const single = agg.lots[0];
  const hasPrice = agg.currentPrice > 0;

  const onKeyDown = useRowKeys({
    onOpen: () => onOpen(single.asset),
    onSelect: () => onToggleIds(agg.ids, !allSelected),
    onExpand: multi && !expanded ? onToggleExpand : undefined,
    onCollapse: multi && expanded ? onToggleExpand : undefined,
  });

  return (
    <div className={`border-b border-border/50 ${allSelected || someSelected ? 'bg-primary/[0.06]' : ''}`} data-holdings-card data-agg-key={agg.key}>
      <div
        data-holdings-row
        role="row"
        tabIndex={0}
        aria-selected={allSelected}
        aria-expanded={multi ? expanded : undefined}
        aria-label={`${agg.ticker}, ${agg.name}`}
        onKeyDown={onKeyDown}
        onClick={() => onOpen(single.asset)}
        className={`w-full px-3 py-3 text-left transition-colors active:bg-accent/40 ${FOCUS_RING}`}
      >
        {/* linha 1 — identidade + valor */}
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={allSelected} onChange={() => onToggleIds(agg.ids, !allSelected)} label={`Selecionar ${agg.ticker}`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[13px] font-semibold">{agg.ticker}</span>
              <span className={`shrink-0 rounded px-1 py-px text-[9px] font-medium ring-1 ring-inset ${typeBadgeClass[agg.type] || 'bg-muted text-muted-foreground ring-border'}`}>
                {typeShort[agg.type] || agg.type}
              </span>
            </div>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{agg.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[13px] font-semibold tabular-nums">{hasPrice ? formatCurrency(agg.value) : '—'}</p>
            {hasPrice && (
              <p className={`font-mono text-[11px] tabular-nums ${agg.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                {formatCurrency(agg.profit)} ({formatPercent(agg.profitPct)})
              </p>
            )}
          </div>
        </div>

        {/* linha 2 — grade compacta de métricas (table-like) */}
        <dl className="mt-2.5 grid grid-cols-4 gap-x-2 gap-y-1 pl-6 text-[10px]">
          {[
            { k: 'Qtd', v: num(agg.quantity, 4) },
            { k: 'PM', v: formatCurrency(agg.avgPrice) },
            { k: 'Atual', v: hasPrice ? formatCurrency(agg.currentPrice) : '—' },
            { k: 'Aloc.', v: pctLabel(agg.allocation) },
          ].map((m) => (
            <div key={m.k} className="min-w-0">
              <dt className="uppercase tracking-wide text-muted-foreground/70">{m.k}</dt>
              <dd className="truncate font-mono text-[11px] tabular-nums">{m.v}</dd>
            </div>
          ))}
        </dl>

        {/* linha 3 — 24h + corretoras + ações */}
        <div className="mt-2 flex items-center gap-2 pl-6">
          {hasPrice && <Delta value={agg.change24h} />}
          {showBrokers && (
            multi ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Recolher' : 'Expandir'} corretoras de ${agg.ticker}`}
                className={`inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground ${FOCUS_RING}`}
              >
                {expanded ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
                {agg.lots.length} corretoras
              </button>
            ) : (
              single.broker !== NO_BROKER && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <BrokerLogo broker={single.broker} size={13} />
                  {single.brokerLabel}
                </span>
              )
            )
          )}
          {!multi && (
            <span className="ml-auto">
              <RowActions
                alwaysVisible
                compact
                label={agg.ticker}
                holdingRow={single.holdingRow}
                onSell={() => single.holdingRow && onSell(single.holdingRow, single.asset)}
                onEdit={() => single.holdingRow && onEdit(single.holdingRow)}
                onDelete={() => single.holdingRow && onDelete(single.holdingRow.id)}
              />
            </span>
          )}
        </div>
      </div>

      {expanded && multi && (
        <div className="space-y-1 border-t border-border/40 bg-muted/20 px-3 py-2">
          {agg.lots.map((lot) => {
            const id = lot.asset.holdingId;
            const isSel = !!id && selected.has(id);
            return (
              <div
                key={id || lot.broker}
                data-holdings-row
                role="row"
                tabIndex={0}
                aria-selected={isSel}
                aria-label={`${agg.ticker} em ${lot.brokerLabel}`}
                onClick={() => onOpen(lot.asset)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter') { e.preventDefault(); onOpen(lot.asset); }
                  if (e.key === ' ') { e.preventDefault(); if (id) onToggleIds([id], !isSel); }
                }}
                className={`flex items-center gap-2 rounded-lg px-2 py-2 ${isSel ? 'bg-primary/10' : 'bg-background/40'} ${FOCUS_RING}`}
              >
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={isSel} onChange={() => id && onToggleIds([id], !isSel)} label={`Selecionar ${agg.ticker} em ${lot.brokerLabel}`} />
                </span>
                {lot.broker !== NO_BROKER && <BrokerLogo broker={lot.broker} size={14} />}
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{lot.brokerLabel}</span>
                <span className="shrink-0 text-right font-mono text-[10px] leading-tight tabular-nums">
                  <span className="block">{num(lot.quantity, 4)} un</span>
                  <span className="block text-muted-foreground">{formatCurrency(lot.value)}</span>
                </span>
                <RowActions
                  alwaysVisible
                  compact
                  label={`${agg.ticker} em ${lot.brokerLabel}`}
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
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Agregação
 * ------------------------------------------------------------------ */

/**
 * Imóveis são bens únicos e indivisíveis: dois imóveis podem compartilhar o
 * mesmo "ticker" (ex.: IMOVEL-TERRASALP) sem serem o mesmo bem. Só ativos
 * financeiros (fungíveis) podem ser unificados por ticker.
 */
export function isPropertyAsset(a: { ticker: string; type: string }): boolean {
  return a.type === 'Imóvel' || a.ticker.trim().toUpperCase().startsWith('IMOVEL');
}

/** Chave de agrupamento. Imóveis recebem chave exclusiva por posição. */
export function aggregationKeyFor(
  a: { ticker: string; type: string; name?: string; broker?: string | null; holdingId?: string | null },
): string {
  const ticker = a.ticker.trim().toUpperCase();
  if (!isPropertyAsset(a)) return ticker;
  const broker = (a.broker || '').trim() || NO_BROKER;
  return `${ticker}::${a.holdingId ?? `${broker}::${a.name}`}`;
}

/** Invariante: nenhuma linha de imóvel pode conter mais de um lote. */
export function assertNoPropertyMerge(list: TickerAggregate[]): TickerAggregate[] {
  list.forEach((agg) => {
    if (isPropertyAsset(agg) && agg.lots.length > 1) {
      throw new Error(
        `Agregação inválida: imóvel ${agg.ticker} unificou ${agg.lots.length} posições distintas.`,
      );
    }
  });
  return list;
}

export function aggregateByTicker(assets: Asset[], holdings: HoldingRow[]): TickerAggregate[] {
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const map = new Map<string, TickerAggregate>();

  assets.forEach((a) => {
    const ticker = a.ticker.trim().toUpperCase();
    const broker = (a.broker || '').trim() || NO_BROKER;
    const key = aggregationKeyFor(a);
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
        key,
        ticker,
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
  return assertNoPropertyMerge(Array.from(map.values()));
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
  const [sort, setSort] = useState<SortState>(loadSortState);

  useEffect(() => {
    try { localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort)); } catch { /* storage indisponível */ }
  }, [sort]);

  const applySort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'ticker' ? 'asc' : 'desc' },
    );
  }, []);

  const toggleExpand = (t: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const aggregates = useMemo(
    () => sortAggregates(aggregateByTicker(assets, holdings), sort),
    [assets, holdings, sort],
  );

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
        const rows = sortAggregates(aggregateByTicker(items, holdings), sort);
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
  }, [assets, holdings, viewMode, sort]);

  const SortHeader = ({ label, sortKey, align = 'right' }: { label: string; sortKey?: SortKey; align?: 'left' | 'right' }) => {
    if (!sortKey) return <div className={align === 'right' ? 'text-right' : ''}>{label}</div>;
    const active = sort.key === sortKey;
    return (
      <div className={align === 'right' ? 'text-right' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          onClick={() => applySort(sortKey)}
          aria-label={`Ordenar por ${SORT_LABELS[sortKey]}${active ? (sort.dir === 'asc' ? ', crescente' : ', decrescente') : ''}`}
          className={`inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider transition-colors hover:text-foreground ${FOCUS_RING} ${
            active ? 'text-primary' : ''
          }`}
        >
          {label}
          {active ? (
            sort.dir === 'asc'
              ? <ArrowUp className="h-3 w-3" aria-hidden />
              : <ArrowDown className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 opacity-0 transition-opacity group-hover/head:opacity-40" aria-hidden />
          )}
        </button>
      </div>
    );
  };

  const header = (
    <div
      role="row"
      className={`group/head ${GRID} sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur`}
    >
      <div />
      <SortHeader label="Ativo" sortKey="ticker" align="left" />
      <div>Tipo</div>
      <div className="text-right">Qtd</div>
      <SortHeader label="PM" sortKey="avgPrice" />
      <div className="text-right">Atual</div>
      <SortHeader label="24h" sortKey="change24h" />
      <SortHeader label="Total" sortKey="value" />
      <SortHeader label="Lucro" sortKey="profit" />
      <SortHeader label="Aloc." sortKey="allocation" />
      <div />
    </div>
  );

  const rowProps = { selected, onToggleIds, onOpen, onEdit, onSell, onDelete };

  /* ---------- barra de ordenação (mobile) ---------- */
  const mobileSortBar = (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card/95 px-3 py-2 no-scrollbar md:hidden">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">Ordenar</span>
      {(['value', 'profit', 'allocation', 'avgPrice'] as SortKey[]).map((k) => {
        const active = sort.key === k;
        return (
          <button
            key={k}
            onClick={() => applySort(k)}
            aria-pressed={active}
            aria-label={`Ordenar por ${SORT_LABELS[k]}`}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${FOCUS_RING} ${
              active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {SORT_LABELS[k]}
            {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
          </button>
        );
      })}
    </div>
  );

  const brokerHeader = (g: (typeof brokerGroups)[number], compact = false) => {
    const isCollapsed = collapsedBrokers.has(g.broker);
    const allSel = g.ids.length > 0 && g.ids.every((id) => selected.has(id));
    return (
      <div className={`flex items-center gap-2.5 border-y border-border/60 bg-muted/40 px-3 py-2 md:px-4 ${compact ? 'text-[11px]' : ''}`}>
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
          aria-expanded={!isCollapsed}
          className={`flex min-w-0 items-center gap-2 rounded text-[12px] font-semibold transition-colors hover:text-primary ${FOCUS_RING}`}
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} aria-hidden />
          {g.broker !== NO_BROKER && <BrokerLogo broker={g.broker} size={16} />}
          <span className="truncate">{g.label}</span>
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
            {g.rows.length} {g.rows.length === 1 ? 'ativo' : 'ativos'}
          </span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums md:gap-3">
          <span className="text-muted-foreground">{formatCurrency(g.value)}</span>
          <span className={g.gain >= 0 ? 'text-gain' : 'text-loss'}>
            {formatCurrency(g.gain)} ({formatPercent(g.cost > 0 ? (g.gain / g.cost) * 100 : 0)})
          </span>
          {g.broker !== NO_BROKER && !compact && (
            <button
              onClick={() => onBrokerFilter(brokerFilter === g.broker ? '' : g.broker)}
              className={`rounded-full border border-border px-2 py-0.5 font-sans text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary ${FOCUS_RING}`}
            >
              {brokerFilter === g.broker ? 'Limpar' : 'Ver só esta'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div data-holdings-root role="grid" aria-label="Carteira de ativos">
      {/* --------- Desktop: grade densa --------- */}
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[1100px]">
          {header}
          {viewMode === 'ticker' &&
            aggregates.map((agg) => (
              <TickerRow
                key={agg.key}
                agg={agg}
                expanded={expanded.has(agg.key)}
                onToggleExpand={() => toggleExpand(agg.key)}
                showBrokerColumn
                {...rowProps}
              />
            ))}

          {viewMode === 'broker' &&
            brokerGroups.map((g) => (
              <div key={g.broker}>
                {brokerHeader(g)}
                {!collapsedBrokers.has(g.broker) &&
                  g.rows.map((agg) => (
                    <TickerRow
                      key={`${g.broker}::${agg.key}`}
                      agg={agg}
                      expanded={false}
                      onToggleExpand={() => {}}
                      showBrokerColumn={false}
                      {...rowProps}
                    />
                  ))}
              </div>
            ))}
        </div>
      </div>

      {/* --------- Mobile: cartões table-like --------- */}
      <div className="md:hidden">
        {mobileSortBar}
        {viewMode === 'ticker' &&
          aggregates.map((agg) => (
            <MobileCard
              key={agg.key}
              agg={agg}
              expanded={expanded.has(agg.key)}
              onToggleExpand={() => toggleExpand(agg.key)}
              showBrokerColumn
              showBrokers
              {...rowProps}
            />
          ))}

        {viewMode === 'broker' &&
          brokerGroups.map((g) => (
            <div key={g.broker}>
              {brokerHeader(g, true)}
              {!collapsedBrokers.has(g.broker) &&
                g.rows.map((agg) => (
                  <MobileCard
                    key={`${g.broker}::${agg.key}`}
                    agg={agg}
                    expanded={false}
                    onToggleExpand={() => {}}
                    showBrokerColumn={false}
                    showBrokers={false}
                    {...rowProps}
                  />
                ))}
            </div>
          ))}
      </div>
    </div>
  );
}

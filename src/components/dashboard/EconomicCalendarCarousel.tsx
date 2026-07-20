import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarClock, Loader2, RefreshCw,
  Filter, Globe, Bell, BellOff, X, ExternalLink, Clock, Target,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  List, LayoutGrid,
} from 'lucide-react';


import { toast } from '@/hooks/use-toast';
import { type Asset } from '@/lib/mockData';
import { computeAffectedHoldings, type AffectedHolding } from '@/lib/eventImpactMap';

interface EcoEvent {
  id: string;
  title: string;
  country: string;
  currency?: string;
  date: string;
  importance: number;
  actual: string | number | null;
  forecast: string | number | null;
  previous: string | number | null;
  unit?: string;
  period?: string;
}

const impactMeta = {
  high:   { label: 'Alto Impacto',  ring: 'border-loss/40 bg-loss/5',           dot: 'bg-loss',        chip: 'bg-loss/15 text-loss',        stripe: 'bg-loss' },
  medium: { label: 'Médio Impacto', ring: 'border-yellow-500/40 bg-yellow-500/5', dot: 'bg-yellow-500', chip: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', stripe: 'bg-yellow-500' },
  low:    { label: 'Baixo Impacto', ring: 'border-gain/40 bg-gain/5',           dot: 'bg-gain',        chip: 'bg-gain/15 text-gain',        stripe: 'bg-gain' },
} as const;
type ImpactKey = keyof typeof impactMeta;

function bucket(imp: number): ImpactKey {
  if (imp >= 1) return 'high';
  if (imp <= -1) return 'low';
  return 'medium';
}

const COUNTRIES = [
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'US', flag: '🇺🇸', name: 'EUA' },
  { code: 'EU', flag: '🇪🇺', name: 'Zona do Euro' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'GB', flag: '🇬🇧', name: 'Reino Unido' },
  { code: 'JP', flag: '🇯🇵', name: 'Japão' },
] as const;

const TIMEZONES = [
  { value: 'local', label: 'Local (auto)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/New_York', label: 'Nova York (ET)' },
  { value: 'Europe/London', label: 'Londres (GMT)' },
  { value: 'Europe/Berlin', label: 'Frankfurt (CET)' },
  { value: 'Asia/Tokyo', label: 'Tóquio (JST)' },
  { value: 'UTC', label: 'UTC' },
];

const LS_FILTERS = 'econcal:filters:v1';
const LS_TZ = 'econcal:tz:v1';
const LS_ALERTS = 'econcal:alerts:v1';
const LS_VIEW = 'econcal:view:v1';
const LS_CACHE_PREFIX = 'econcal:cache:v1:';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const PAGE_SIZE = 8;

type Filters = { countries: string[]; impacts: ImpactKey[] };
type ViewMode = 'list' | 'grid';

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(LS_FILTERS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { countries: COUNTRIES.map(c => c.code), impacts: ['high', 'medium', 'low'] };
}
function loadTz(): string { return localStorage.getItem(LS_TZ) || 'local'; }
function loadView(): ViewMode { return (localStorage.getItem(LS_VIEW) as ViewMode) || 'grid'; }
function loadAlerts(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(LS_ALERTS) || '{}'); } catch { return {}; }
}
function saveAlerts(a: Record<string, true>) { localStorage.setItem(LS_ALERTS, JSON.stringify(a)); }

function loadCache(key: string): { at: number; events: EcoEvent[] } | null {
  try {
    const raw = localStorage.getItem(LS_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events) && typeof parsed.at === 'number') return parsed;
  } catch {}
  return null;
}
function saveCache(key: string, events: EcoEvent[]) {
  try { localStorage.setItem(LS_CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), events })); } catch {}
}

function fmtTime(iso: string, tz: string) {
  try {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    if (tz !== 'local') opts.timeZone = tz;
    return new Date(iso).toLocaleTimeString('pt-BR', opts);
  } catch { return new Date(iso).toLocaleTimeString('pt-BR'); }
}
function fmtDateTime(iso: string, tz: string) {
  try {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };
    if (tz !== 'local') opts.timeZone = tz;
    return new Date(iso).toLocaleString('pt-BR', opts);
  } catch { return new Date(iso).toLocaleString('pt-BR'); }
}

function impactSummary(ev: EcoEvent, affectedCount: number): string {
  const key = bucket(ev.importance);
  const base = key === 'high' ? 'Alto potencial de volatilidade'
    : key === 'medium' ? 'Impacto moderado esperado'
    : 'Impacto reduzido no mercado';
  const ctx = ev.country === 'BR' ? 'Ibov/USD-BRL/DI'
    : ev.country === 'US' ? 'S&P/Nasdaq/Treasuries'
    : 'mercados regionais';
  return affectedCount > 0
    ? `${base} · ${ctx} · ${affectedCount} ativo(s) da carteira`
    : `${base} · ${ctx}`;
}

/**
 * Rich, multi-part explanation shown before each event so the user
 * grasps relevance quickly:
 *  - Aggregated relevance from importance + country
 *  - Surprise (Atual vs Previsão)
 *  - Histórico (Anterior → Previsão): revisão de expectativa
 */
function detailedImpactExplanation(ev: EcoEvent): {
  aggregate: string;
  surprise: { value: number; label: string } | null;
  historical: { delta: number; label: string } | null;
} {
  const key = bucket(ev.importance);
  const region = ev.country === 'BR' ? 'no mercado brasileiro'
    : ev.country === 'US' ? 'nos mercados dos EUA e derivados globais'
    : ev.country === 'EU' ? 'na Zona do Euro'
    : ev.country === 'CN' ? 'na China e cadeias de commodities'
    : ev.country === 'GB' ? 'no Reino Unido'
    : ev.country === 'JP' ? 'no Japão'
    : 'nos mercados regionais';
  const aggregate = key === 'high'
    ? `Evento de alta relevância ${region}: costuma gerar movimentos rápidos em índices, câmbio e juros.`
    : key === 'medium'
      ? `Relevância moderada ${region}: pode ajustar expectativas sem grande volatilidade imediata.`
      : `Baixa relevância ${region}: efeito marginal, monitorado como leitura complementar.`;

  const a = Number(ev.actual), f = Number(ev.forecast), p = Number(ev.previous);
  let surprise: { value: number; label: string } | null = null;
  if (isFinite(a) && isFinite(f) && f !== 0) {
    const v = ((a - f) / Math.abs(f)) * 100;
    surprise = {
      value: v,
      label: v >= 0
        ? `Atual (${ev.actual}) veio ${Math.abs(v).toFixed(1)}% acima da previsão (${ev.forecast})`
        : `Atual (${ev.actual}) veio ${Math.abs(v).toFixed(1)}% abaixo da previsão (${ev.forecast})`,
    };
  }
  let historical: { delta: number; label: string } | null = null;
  if (isFinite(f) && isFinite(p) && p !== 0) {
    const d = ((f - p) / Math.abs(p)) * 100;
    historical = {
      delta: d,
      label: `Previsão (${ev.forecast}) vs. anterior (${ev.previous}): ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`,
    };
  }
  return { aggregate, surprise, historical };
}

export default function EconomicCalendarPanel({ assets = [] }: { assets?: Asset[] } = {}) {
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const cacheKey = useMemo(() => [...filters.countries].sort().join(','), [filters.countries]);
  const initialCache = useMemo(() => loadCache(cacheKey), [cacheKey]);

  const [events, setEvents] = useState<EcoEvent[]>(initialCache?.events ?? []);
  const [lastFetchAt, setLastFetchAt] = useState<number>(initialCache?.at ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string>(loadTz);
  const [alerts, setAlerts] = useState<Record<string, true>>(loadAlerts);
  const [showFilters, setShowFilters] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<ViewMode>(loadView);
  const [page, setPage] = useState(0);
  const [modalEvent, setModalEvent] = useState<EcoEvent | null>(null);
  const alertTimers = useRef<number[]>([]);
  const inflight = useRef<string | null>(null);


  useEffect(() => { localStorage.setItem(LS_FILTERS, JSON.stringify(filters)); }, [filters]);
  useEffect(() => { localStorage.setItem(LS_TZ, tz); }, [tz]);
  useEffect(() => { localStorage.setItem(LS_VIEW, view); }, [view]);
  useEffect(() => { setPage(0); }, [filters.impacts, filters.countries, view]);

  const load = useCallback(async (force = false) => {
    // Dedup concurrent requests per cache key
    if (inflight.current === cacheKey) return;
    // Hydrate from cache immediately
    const cached = loadCache(cacheKey);
    if (cached) {
      setEvents(cached.events);
      setLastFetchAt(cached.at);
      if (!force && Date.now() - cached.at < CACHE_TTL_MS) return; // fresh
    }
    inflight.current = cacheKey;
    setLoading(true);
    setError(null);
    try {
      const q = filters.countries.length ? `?countries=${filters.countries.join(',')}` : '';
      const { data, error: fnError } = await supabase.functions.invoke(`economic-calendar${q}`, {});
      if (fnError) throw fnError;
      const evts: EcoEvent[] = Array.isArray(data?.events) ? data.events : [];
      setEvents(evts);
      setLastFetchAt(Date.now());
      saveCache(cacheKey, evts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar calendário');
    } finally {
      setLoading(false);
      inflight.current = null;
    }
  }, [cacheKey, filters.countries]);

  useEffect(() => { load(false); }, [load]);

  // Auto-refresh in background every CACHE_TTL_MS
  useEffect(() => {
    const id = window.setInterval(() => load(false), CACHE_TTL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => events.filter(e =>
    filters.countries.includes(e.country) && filters.impacts.includes(bucket(e.importance))
  ), [events, filters]);

  const sorted = useMemo(() => {
    // High → Medium → Low, then by date asc
    const order: Record<ImpactKey, number> = { high: 0, medium: 1, low: 2 };
    return [...filtered].sort((a, b) => {
      const oa = order[bucket(a.importance)], ob = order[bucket(b.importance)];
      if (oa !== ob) return oa - ob;
      return a.date > b.date ? 1 : -1;
    });
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<ImpactKey, number> = { high: 0, medium: 0, low: 0 };
    filtered.forEach(e => { c[bucket(e.importance)]++; });
    return c;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => view === 'list' ? sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : sorted,
    [sorted, page, view]
  );

  // Schedule browser notifications for enabled alerts (10 min before)
  useEffect(() => {
    alertTimers.current.forEach(id => window.clearTimeout(id));
    alertTimers.current = [];
    const now = Date.now();
    Object.keys(alerts).forEach(eid => {
      const ev = events.find(e => e.id === eid);
      if (!ev) return;
      const t = new Date(ev.date).getTime() - 10 * 60 * 1000 - now;
      if (t > 0 && t < 24 * 3600 * 1000) {
        const id = window.setTimeout(() => {
          const msg = `${ev.title} (${ev.country}) em 10 min`;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('📅 Calendário Econômico', { body: msg });
          }
          toast({ title: '📅 Evento próximo', description: msg });
        }, t);
        alertTimers.current.push(id);
      }
    });
    return () => alertTimers.current.forEach(id => window.clearTimeout(id));
  }, [alerts, events]);

  const toggleAlert = (ev: EcoEvent) => {
    setAlerts(prev => {
      const next = { ...prev };
      if (next[ev.id]) {
        delete next[ev.id];
        toast({ title: 'Alerta removido', description: ev.title });
      } else {
        next[ev.id] = true;
        toast({ title: 'Alerta criado', description: `Aviso 10 min antes de: ${ev.title}` });
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
      saveAlerts(next);
      return next;
    });
  };

  const toggleCountry = (c: string) => setFilters(f => ({
    ...f, countries: f.countries.includes(c) ? f.countries.filter(x => x !== c) : [...f.countries, c],
  }));
  const toggleImpact = (k: ImpactKey) => setFilters(f => ({
    ...f, impacts: f.impacts.includes(k) ? f.impacts.filter(x => x !== k) : [...f.impacts, k],
  }));

  const countryOf = (c: string) => COUNTRIES.find(x => x.code === c);

  const createTickerAlert = (ticker: string) => {
    window.dispatchEvent(new CustomEvent('open-alert-modal', { detail: { ticker } }));
    toast({
      title: `Novo alerta para ${ticker}`,
      description: 'Abra a aba "Alertas" para configurar preço, stop-loss ou take-profit.',
    });
  };

  const freshnessLabel = lastFetchAt
    ? (() => {
        const mins = Math.floor((Date.now() - lastFetchAt) / 60000);
        return mins < 1 ? 'agora' : `${mins}m`;
      })()
    : '';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      {/* Compact header — responsive: chips wrap on mobile */}
      <div className="px-2 sm:px-3 py-2 flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold whitespace-nowrap">Calendário Econômico</span>
          {collapsed ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
        </button>

        {/* Impact filter chips with counts */}
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por impacto">
          {(['high', 'medium', 'low'] as ImpactKey[]).map(k => {
            const on = filters.impacts.includes(k);
            const meta = impactMeta[k];
            return (
              <button key={k} type="button" onClick={() => toggleImpact(k)}
                aria-pressed={on}
                aria-label={`${meta.label}: ${counts[k]} evento(s). ${on ? 'Mostrando' : 'Ocultado'}. Clique para alternar.`}
                title={meta.label}
                className={`text-[10px] px-1.5 h-6 rounded border transition-all flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? meta.chip + ' border-transparent' : 'border-border text-muted-foreground opacity-60 hover:opacity-100'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                <span className="font-mono">{counts[k]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0" />

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <div className="hidden sm:flex items-center rounded border border-border overflow-hidden">
            <button onClick={() => setView('list')} title="Modo lista paginada"
              className={`h-6 w-6 flex items-center justify-center transition-all ${view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <List className="h-3 w-3" />
            </button>
            <button onClick={() => setView('grid')} title="Modo grade densa"
              className={`h-6 w-6 flex items-center justify-center transition-all ${view === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <LayoutGrid className="h-3 w-3" />
            </button>
          </div>
          {/* Mobile: single toggle button */}
          <button onClick={() => setView(v => v === 'list' ? 'grid' : 'list')}
            title={view === 'list' ? 'Modo grade densa' : 'Modo lista paginada'}
            className="sm:hidden h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
            {view === 'list' ? <LayoutGrid className="h-3 w-3" /> : <List className="h-3 w-3" />}
          </button>
          <button onClick={() => setShowFilters(s => !s)} title="Filtros de país/fuso"
            className={`h-6 w-6 rounded border flex items-center justify-center transition-all ${showFilters ? 'border-primary/60 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            <Filter className="h-3 w-3" />
          </button>
          <button onClick={() => load(true)} disabled={loading} title={freshnessLabel ? `Atualizado há ${freshnessLabel}` : 'Atualizar'}
            className="h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {showFilters && !collapsed && (
        <div className="border-t border-border bg-muted/20 px-2 sm:px-3 py-2 space-y-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" /> Países
            </span>
            {COUNTRIES.map(c => {
              const on = filters.countries.includes(c.code);
              return (
                <button key={c.code} onClick={() => toggleCountry(c.code)}
                  className={`text-[10px] px-1.5 h-5 rounded border transition-all ${on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground opacity-60 hover:opacity-100'}`}>
                  {c.flag} {c.code}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Fuso
            </span>
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="h-6 text-[10px] rounded border border-border bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {freshnessLabel && (
              <span className="text-[10px] text-muted-foreground ml-auto">Atualizado há {freshnessLabel}</span>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="border-t border-border">
          {loading && !filtered.length ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-[10px] text-muted-foreground">Carregando...</span>
            </div>
          ) : error && !filtered.length ? (
            <p className="px-3 py-2 text-[10px] text-loss">⚠️ {error}</p>
          ) : !filtered.length ? (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">Nenhum evento com os filtros atuais.</p>
          ) : view === 'grid' ? (
            /* Dense grid — auto-fill responsive columns */
            <div className="p-2 grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {pageItems.map(ev => {
                const key = bucket(ev.importance);
                const meta = impactMeta[key];
                const c = countryOf(ev.country);
                const time = fmtTime(ev.date, tz);
                const alertOn = !!alerts[ev.id];
                const affected = computeAffectedHoldings(ev, assets, 1);
                const surprise = (() => {
                  const a = Number(ev.actual), f = Number(ev.forecast);
                  if (!isFinite(a) || !isFinite(f) || f === 0) return null;
                  return ((a - f) / Math.abs(f)) * 100;
                })();
                const detail = detailedImpactExplanation(ev);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setModalEvent(ev)}
                    aria-label={`${meta.label}. ${time}. ${ev.title}. ${detail.aggregate}${detail.surprise ? '. ' + detail.surprise.label : ''}. Abrir detalhes.`}
                    className={`group text-left rounded-md border ${meta.ring} flex overflow-hidden hover:scale-[1.01] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                  >
                    <div className={`w-1 shrink-0 ${meta.stripe}`} aria-hidden="true" />
                    <div className="px-2 py-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" aria-hidden="true">{c?.flag || '🌐'}</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{time}</span>
                        <span className="text-[11px] font-medium truncate flex-1">{ev.title}</span>
                        {surprise !== null && (
                          <span className={`text-[9px] font-mono font-semibold shrink-0 ${surprise >= 0 ? 'text-gain' : 'text-loss'}`}>
                            {surprise >= 0 ? '+' : ''}{surprise.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {/* Detailed explanation before the item */}
                      <p className="text-[9px] text-muted-foreground/90 mt-0.5 leading-snug line-clamp-2">
                        {detail.aggregate}
                        {detail.surprise && <> · <span className={detail.surprise.value >= 0 ? 'text-gain' : 'text-loss'}>{detail.surprise.label}</span></>}
                        {detail.historical && <> · {detail.historical.label}</>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {affected.length > 0 && <Target className="h-2.5 w-2.5 text-primary shrink-0" aria-hidden="true" />}
                        <span className="text-[9px] text-muted-foreground truncate">{impactSummary(ev, affected.length)}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-pressed={alertOn}
                          aria-label={alertOn ? `Remover alerta de ${ev.title}` : `Criar alerta 10 min antes de ${ev.title}`}
                          onClick={(e) => { e.stopPropagation(); toggleAlert(ev); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleAlert(ev); } }}
                          className={`ml-auto h-5 w-5 rounded flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${alertOn ? 'text-primary' : 'text-muted-foreground/50 opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                        >
                          {alertOn ? <Bell className="h-2.5 w-2.5" /> : <BellOff className="h-2.5 w-2.5" />}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Paginated list — one row per event, impact summary before content */
            <>
              <ul className="divide-y divide-border">
                {pageItems.map(ev => {
                  const key = bucket(ev.importance);
                  const meta = impactMeta[key];
                  const c = countryOf(ev.country);
                  const time = fmtTime(ev.date, tz);
                  const alertOn = !!alerts[ev.id];
                  const affected = computeAffectedHoldings(ev, assets, 1);
                  const surprise = (() => {
                    const a = Number(ev.actual), f = Number(ev.forecast);
                    if (!isFinite(a) || !isFinite(f) || f === 0) return null;
                    return ((a - f) / Math.abs(f)) * 100;
                  })();
                  const detail = detailedImpactExplanation(ev);
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => setModalEvent(ev)}
                        aria-label={`${meta.label}. ${time}. ${ev.title}. ${detail.aggregate}${detail.surprise ? '. ' + detail.surprise.label : ''}. Abrir detalhes.`}
                        className="w-full text-left px-2 sm:px-3 py-2 flex items-start gap-2 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <div className={`w-1 self-stretch rounded-full shrink-0 ${meta.stripe}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs" aria-hidden="true">{c?.flag || '🌐'}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">{time}</span>
                            <span className="text-[11px] sm:text-xs font-medium truncate flex-1 min-w-0">{ev.title}</span>
                            {surprise !== null && (
                              <span className={`text-[9px] font-mono font-semibold shrink-0 ${surprise >= 0 ? 'text-gain' : 'text-loss'}`}>
                                {surprise >= 0 ? '+' : ''}{surprise.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {/* Detailed explanation shown before the item */}
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground/90 mt-0.5 leading-snug">
                            {detail.aggregate}
                            {detail.surprise && <> · <span className={detail.surprise.value >= 0 ? 'text-gain' : 'text-loss'}>{detail.surprise.label}</span></>}
                            {detail.historical && <> · {detail.historical.label}</>}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {affected.length > 0 && <Target className="h-2.5 w-2.5 text-primary shrink-0" aria-hidden="true" />}
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
                              {impactSummary(ev, affected.length)}
                            </span>
                          </div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-pressed={alertOn}
                          aria-label={alertOn ? `Remover alerta de ${ev.title}` : `Criar alerta 10 min antes de ${ev.title}`}
                          onClick={(e) => { e.stopPropagation(); toggleAlert(ev); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleAlert(ev); } }}
                          className={`h-6 w-6 rounded flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${alertOn ? 'text-primary' : 'text-muted-foreground/60'}`}
                        >
                          {alertOn ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {totalPages > 1 && (
                <div className="px-2 sm:px-3 py-1.5 border-t border-border flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} de {sorted.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] font-mono px-1">{page + 1}/{totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="h-6 w-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modalEvent && (
        <EventModal
          event={modalEvent}
          tz={tz}
          alertOn={!!alerts[modalEvent.id]}
          affected={computeAffectedHoldings(modalEvent, assets, 10)}
          onToggleAlert={() => toggleAlert(modalEvent)}
          onCreateTickerAlert={createTickerAlert}
          onClose={() => setModalEvent(null)}
        />
      )}
    </div>
  );
}

function EventModal({ event, tz, alertOn, affected, onToggleAlert, onCreateTickerAlert, onClose }: {
  event: EcoEvent; tz: string; alertOn: boolean;
  affected: AffectedHolding[];
  onToggleAlert: () => void;
  onCreateTickerAlert: (ticker: string) => void;
  onClose: () => void;
}) {
  const meta = impactMeta[bucket(event.importance)];
  const c = COUNTRIES.find(x => x.code === event.country);
  const surprise = (() => {
    const a = Number(event.actual), f = Number(event.forecast);
    if (!isFinite(a) || !isFinite(f) || f === 0) return null;
    return ((a - f) / Math.abs(f)) * 100;
  })();
  const query = encodeURIComponent(`${event.title} ${event.country}`);
  const links = [
    { label: 'TradingView', url: `https://www.tradingview.com/economic-calendar/?search=${query}` },
    { label: 'Investing.com', url: `https://www.investing.com/search/?q=${query}` },
    { label: 'Notícias (Google)', url: `https://www.google.com/search?q=${query}&tbm=nws` },
  ];

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = `eco-ev-${event.id}-title`;
  const descId = `eco-ev-${event.id}-desc`;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg" aria-hidden="true">{c?.flag || '🌐'}</span>
              <span className="text-xs font-mono text-muted-foreground">{event.country}</span>
              {event.currency && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{event.currency}</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${meta.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" /> {meta.label}
              </span>
            </div>
            <h3 id={titleId} className="text-base font-semibold leading-snug">{event.title}</h3>
            <p id={descId} className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" /> {fmtDateTime(event.date, tz)}
              {event.period && <> · Período: <span className="font-mono">{event.period}</span></>}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do evento"
            className="shrink-0 h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Anterior</p>
              <p className="text-lg font-mono font-semibold">{event.previous ?? '—'}<span className="text-xs text-muted-foreground">{event.unit}</span></p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Previsão</p>
              <p className="text-lg font-mono font-semibold">{event.forecast ?? '—'}<span className="text-xs text-muted-foreground">{event.unit}</span></p>
            </div>
            <div className={`rounded-lg p-3 ${event.actual != null ? meta.chip : 'bg-muted/40'}`}>
              <p className="text-[10px] uppercase opacity-75">Atual</p>
              <p className="text-lg font-mono font-semibold">{event.actual ?? '—'}<span className="text-xs opacity-75">{event.actual != null ? event.unit : ''}</span></p>
            </div>
          </div>

          {surprise !== null && (
            <div className={`rounded-lg p-3 border ${surprise >= 0 ? 'border-gain/40 bg-gain/5' : 'border-loss/40 bg-loss/5'}`}>
              <p className="text-[10px] uppercase text-muted-foreground">Surpresa vs. Previsão</p>
              <p className={`text-sm font-semibold ${surprise >= 0 ? 'text-gain' : 'text-loss'}`}>
                {surprise >= 0 ? '+' : ''}{surprise.toFixed(2)}%
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold mb-1">Contexto</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Indicadores de <strong>{meta.label.toLowerCase()}</strong> como este tendem a mover
              {event.country === 'BR' ? ' o Ibovespa, o câmbio USD/BRL e a curva de juros DI.'
                : event.country === 'US' ? ' índices globais (S&P/Nasdaq), Treasuries e o DXY.'
                : ' os mercados regionais associados e podem repercutir globalmente.'}
              {' '}Compare <em>Atual</em> vs <em>Previsão</em>: surpresas positivas costumam favorecer ativos de risco quando o dado é pró-crescimento; o oposto em dados inflacionários.
            </p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" />
              Impacto na sua carteira
              <span className="text-[10px] font-normal text-muted-foreground">
                ({affected.length ? `${affected.length} ativo(s)` : 'nenhum ativo relacionado'})
              </span>
            </p>
            {affected.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhum ativo da sua carteira mostra sensibilidade direta a este evento.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {affected.map(h => (
                  <li key={h.asset.ticker}
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold">{h.asset.ticker}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{h.asset.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {h.reasons.slice(0, 3).map(r => (
                          <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                            {r}
                          </span>
                        ))}
                        <span className="text-[9px] text-muted-foreground">
                          · {(h.asset.allocation || 0).toFixed(1)}% da carteira
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-14 h-1.5 rounded-full bg-border overflow-hidden" title={`Impacto relativo ${h.score}`}>
                        <div
                          className={h.score >= 70 ? 'h-full bg-loss' : h.score >= 40 ? 'h-full bg-yellow-500' : 'h-full bg-gain'}
                          style={{ width: `${h.score}%` }}
                        />
                      </div>
                      <button
                        onClick={() => onCreateTickerAlert(h.asset.ticker)}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-1"
                        title={`Criar alerta para ${h.asset.ticker}`}
                      >
                        <Bell className="h-2.5 w-2.5" /> Alerta
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>


          <div>
            <p className="text-xs font-semibold mb-2">Links úteis</p>
            <div className="flex flex-wrap gap-2">
              {links.map(l => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
                  className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Alertas usam notificações do navegador · aviso 10 min antes
          </p>
          <button onClick={onToggleAlert}
            className={`text-xs px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 ${alertOn ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40'}`}>
            {alertOn ? <><Bell className="h-3.5 w-3.5" /> Alerta ativo</> : <><BellOff className="h-3.5 w-3.5" /> Criar alerta</>}
          </button>
        </div>
      </div>
    </div>
  );
}

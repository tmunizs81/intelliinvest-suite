import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarClock, Loader2, RefreshCw,
  Filter, Globe, Bell, BellOff, X, ExternalLink, Clock, Target,
  ChevronDown, ChevronUp,
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
  high:   { label: 'Alto Impacto',  ring: 'border-loss/40 bg-loss/5',           dot: 'bg-loss',        chip: 'bg-loss/15 text-loss' },
  medium: { label: 'Médio Impacto', ring: 'border-yellow-500/40 bg-yellow-500/5', dot: 'bg-yellow-500', chip: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' },
  low:    { label: 'Baixo Impacto', ring: 'border-gain/40 bg-gain/5',           dot: 'bg-gain',        chip: 'bg-gain/15 text-gain' },
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

type Filters = { countries: string[]; impacts: ImpactKey[] };

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(LS_FILTERS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { countries: COUNTRIES.map(c => c.code), impacts: ['high', 'medium', 'low'] };
}
function loadTz(): string { return localStorage.getItem(LS_TZ) || 'local'; }
function loadAlerts(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(LS_ALERTS) || '{}'); } catch { return {}; }
}
function saveAlerts(a: Record<string, true>) { localStorage.setItem(LS_ALERTS, JSON.stringify(a)); }

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

export default function EconomicCalendarPanel({ assets = [] }: { assets?: Asset[] } = {}) {
  const [events, setEvents] = useState<EcoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [tz, setTz] = useState<string>(loadTz);
  const [alerts, setAlerts] = useState<Record<string, true>>(loadAlerts);
  const [showFilters, setShowFilters] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [modalEvent, setModalEvent] = useState<EcoEvent | null>(null);
  const alertTimers = useRef<number[]>([]);


  useEffect(() => { localStorage.setItem(LS_FILTERS, JSON.stringify(filters)); }, [filters]);
  useEffect(() => { localStorage.setItem(LS_TZ, tz); }, [tz]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filters.countries.length ? `?countries=${filters.countries.join(',')}` : '';
      const { data, error: fnError } = await supabase.functions.invoke(`economic-calendar${q}`, {});
      if (fnError) throw fnError;
      const evts: EcoEvent[] = Array.isArray(data?.events) ? data.events : [];
      setEvents(evts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar calendário');
    } finally {
      setLoading(false);
    }
  }, [filters.countries]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => events.filter(e =>
    filters.countries.includes(e.country) && filters.impacts.includes(bucket(e.importance))
  ), [events, filters]);

  const grouped = useMemo(() => {
    const g: Record<ImpactKey, EcoEvent[]> = { high: [], medium: [], low: [] };
    filtered.forEach(e => g[bucket(e.importance)].push(e));
    (Object.keys(g) as ImpactKey[]).forEach(k =>
      g[k].sort((a, b) => (a.date > b.date ? 1 : -1))
    );
    return g;
  }, [filtered]);

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



  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center">
            <CalendarClock className="h-3.5 w-3.5 text-secondary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Calendário Econômico</h3>
            <p className="text-[10px] text-muted-foreground">
              {filtered.length ? `${filtered.length} evento(s) hoje` : 'Eventos macro do dia'}
              {' · '}<Clock className="inline h-2.5 w-2.5" /> {TIMEZONES.find(t => t.value === tz)?.label || tz}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="h-7 text-[10px] rounded-md border border-border bg-background px-1.5 hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary"
            title="Fuso horário"
          >
            {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={() => setShowFilters(s => !s)} title="Filtros"
            className={`h-7 w-7 rounded-md border flex items-center justify-center transition-all ${showFilters ? 'border-primary/60 text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'}`}>
            <Filter className="h-3 w-3" />
          </button>
          <button onClick={load} disabled={loading}
            className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="border-b border-border bg-muted/20 p-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Países / Zonas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.map(c => {
                const on = filters.countries.includes(c.code);
                return (
                  <button key={c.code} onClick={() => toggleCountry(c.code)}
                    className={`text-[10px] px-2 py-1 rounded-md border transition-all ${on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                    {c.flag} {c.code}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">Impacto</p>
            <div className="flex flex-wrap gap-1.5">
              {(['high', 'medium', 'low'] as ImpactKey[]).map(k => {
                const on = filters.impacts.includes(k);
                const meta = impactMeta[k];
                const count = grouped[k].length;
                return (
                  <button key={k} onClick={() => toggleImpact(k)}
                    className={`text-[10px] px-2 py-1 rounded-md border transition-all flex items-center gap-1 ${on ? meta.chip + ' border-transparent' : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                    <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-[220px]">
        {loading && !filtered.length && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Carregando eventos...</p>
          </div>
        )}

        {error && !filtered.length && <p className="text-xs text-loss">⚠️ {error}</p>}

        {!loading && !error && !filtered.length && (
          <p className="text-xs text-muted-foreground text-center py-6">
            Nenhum evento corresponde aos filtros selecionados.
          </p>
        )}

        {(['high', 'medium', 'low'] as ImpactKey[]).map(key => {
          const items = grouped[key];
          if (!items.length) return null;
          const meta = impactMeta[key];
          return (
            <section key={key}>
              <header className="flex items-center gap-2 mb-2 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider">{meta.label}</h4>
                <span className="text-[10px] text-muted-foreground">{items.length}</span>
                <div className="flex-1 h-px bg-border" />
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map(ev => {
                  const c = countryOf(ev.country);
                  const time = fmtTime(ev.date, tz);
                  const alertOn = !!alerts[ev.id];
                  const affected = computeAffectedHoldings(ev, assets, 4);
                  const topScore = affected[0]?.score ?? 0;
                  const stripeCls = key === 'high' ? 'bg-loss' : key === 'medium' ? 'bg-yellow-500' : 'bg-gain';
                  // Short summary: top reason + count of affected tickers, or fallback by impact
                  const summary = affected.length
                    ? `${affected[0].reasons[0] || 'Impacto direto'} · ${affected.length} ativo(s) da sua carteira`
                    : key === 'high'
                      ? 'Sem exposição direta detectada — pode mover índices globais'
                      : key === 'medium'
                        ? 'Sem impacto direto na sua carteira'
                        : 'Baixa relevância para seus ativos';
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setModalEvent(ev)}
                      className={`text-left rounded-lg border ${meta.ring} transition-all hover:scale-[1.01] cursor-pointer flex overflow-hidden`}
                    >
                      {/* Visual impact stripe */}
                      <div className={`w-1 shrink-0 ${stripeCls}`} />
                      <div className="flex-1 p-2.5 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm">{c?.flag || '🌐'}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{ev.country}</span>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-[10px] text-muted-foreground">{time}</span>
                          </div>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleAlert(ev); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleAlert(ev); } }}
                            title={alertOn ? 'Remover alerta' : 'Criar alerta (10min antes)'}
                            className={`h-5 w-5 rounded flex items-center justify-center transition-all cursor-pointer shrink-0 ${alertOn ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            {alertOn ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                          </span>
                        </div>

                        <p className="text-xs font-semibold leading-snug mb-1.5 line-clamp-2">{ev.title}</p>

                        {/* Impact summary line — always visible */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <Target className={`h-2.5 w-2.5 shrink-0 ${affected.length ? 'text-primary' : 'text-muted-foreground'}`} />
                          <p className={`text-[10px] leading-tight line-clamp-1 ${affected.length ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {summary}
                          </p>
                          {affected.length > 0 && (
                            <span className="ml-auto text-[9px] font-mono text-muted-foreground shrink-0">
                              {topScore}%
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          <div className="rounded bg-muted/40 p-1">
                            <p className="text-[8px] uppercase text-muted-foreground">Ant.</p>
                            <p className="font-mono font-semibold truncate">{ev.previous ?? '—'}{ev.unit}</p>
                          </div>
                          <div className="rounded bg-muted/40 p-1">
                            <p className="text-[8px] uppercase text-muted-foreground">Prev.</p>
                            <p className="font-mono font-semibold truncate">{ev.forecast ?? '—'}{ev.unit}</p>
                          </div>
                          <div className={`rounded p-1 ${ev.actual != null ? meta.chip : 'bg-muted/40'}`}>
                            <p className="text-[8px] uppercase opacity-75">Atual</p>
                            <p className="font-mono font-semibold truncate">{ev.actual ?? '—'}{ev.actual != null ? ev.unit : ''}</p>
                          </div>
                        </div>

                        {affected.length > 0 && (
                          <div className="mt-2 pt-1.5 border-t border-border/50">
                            <div className="flex items-center gap-1 flex-wrap">
                              {affected.slice(0, 4).map(h => (
                                <span key={h.asset.ticker}
                                  title={h.reasons.join(' · ')}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">
                                  {h.asset.ticker}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>

                  );
                })}
              </div>
            </section>
          );
        })}
      </div>


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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg">{c?.flag || '🌐'}</span>
              <span className="text-xs font-mono text-muted-foreground">{event.country}</span>
              {event.currency && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{event.currency}</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${meta.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
              </span>
            </div>
            <h3 className="text-base font-semibold leading-snug">{event.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {fmtDateTime(event.date, tz)}
              {event.period && <> · Período: <span className="font-mono">{event.period}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
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

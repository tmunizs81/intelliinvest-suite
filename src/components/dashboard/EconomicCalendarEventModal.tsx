import { useEffect, useRef } from 'react';
import { Bell, BellOff, Clock, ExternalLink, Target, X } from 'lucide-react';
import type { AffectedHolding } from '@/lib/eventImpactMap';

export interface EcoEvent {
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
  high:   { label: 'Alto Impacto',  chip: 'bg-loss/15 text-loss',        dot: 'bg-loss' },
  medium: { label: 'Médio Impacto', chip: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:    { label: 'Baixo Impacto', chip: 'bg-gain/15 text-gain',        dot: 'bg-gain' },
} as const;

const COUNTRIES = [
  { code: 'BR', flag: '🇧🇷' }, { code: 'US', flag: '🇺🇸' }, { code: 'EU', flag: '🇪🇺' },
  { code: 'CN', flag: '🇨🇳' }, { code: 'GB', flag: '🇬🇧' }, { code: 'JP', flag: '🇯🇵' },
];

function bucket(imp: number): keyof typeof impactMeta {
  if (imp >= 1) return 'high';
  if (imp <= -1) return 'low';
  return 'medium';
}

function fmtDateTime(iso: string, tz: string) {
  try {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };
    if (tz !== 'local') opts.timeZone = tz;
    return new Date(iso).toLocaleString('pt-BR', opts);
  } catch { return new Date(iso).toLocaleString('pt-BR'); }
}

export default function EconomicCalendarEventModal({
  event, tz, alertOn, affected, onToggleAlert, onCreateTickerAlert, onClose,
}: {
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

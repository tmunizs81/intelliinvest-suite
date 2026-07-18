import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Pause, Play, RefreshCw } from 'lucide-react';

interface EcoEvent {
  id: string;
  title: string;
  country: string;
  currency?: string;
  date: string;
  importance: number; // -1 low, 0 medium, 1 high
  actual: string | number | null;
  forecast: string | number | null;
  previous: string | number | null;
  unit?: string;
  period?: string;
}

const impactMeta = {
  high: {
    label: 'Alto Impacto',
    ring: 'border-loss/40 bg-loss/5',
    dot: 'bg-loss',
    text: 'text-loss',
    chip: 'bg-loss/15 text-loss',
  },
  medium: {
    label: 'Médio Impacto',
    ring: 'border-yellow-500/40 bg-yellow-500/5',
    dot: 'bg-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
    chip: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
  low: {
    label: 'Baixo Impacto',
    ring: 'border-gain/40 bg-gain/5',
    dot: 'bg-gain',
    text: 'text-gain',
    chip: 'bg-gain/15 text-gain',
  },
} as const;

function bucket(imp: number): keyof typeof impactMeta {
  if (imp >= 1) return 'high';
  if (imp <= -1) return 'low';
  return 'medium';
}

const countryFlag: Record<string, string> = {
  BR: '🇧🇷', US: '🇺🇸', EU: '🇪🇺', CN: '🇨🇳', GB: '🇬🇧', JP: '🇯🇵',
};

export default function EconomicCalendarPanel() {
  const [events, setEvents] = useState<EcoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('economic-calendar', {});
      if (fnError) throw fnError;
      const evts: EcoEvent[] = Array.isArray(data?.events) ? data.events : [];
      setEvents(evts);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar calendário');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (paused || events.length <= 1) return;
    timerRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % events.length);
    }, 5000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [paused, events.length]);

  const go = (delta: number) => {
    if (!events.length) return;
    setIndex((i) => (i + delta + events.length) % events.length);
  };

  const current = events[index];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center">
            <CalendarClock className="h-3.5 w-3.5 text-secondary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Calendário Econômico</h3>
            <p className="text-[10px] text-muted-foreground">
              {events.length ? `${index + 1} de ${events.length} eventos hoje` : 'Eventos macro do dia'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-2 mr-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gain" /> Baixo</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Médio</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-loss" /> Alto</span>
          </div>
          <button onClick={() => setPaused((p) => !p)} title={paused ? 'Retomar' : 'Pausar'}
            className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
          <button onClick={load} disabled={loading}
            className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col justify-center min-h-[180px]">
        {loading && !current && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Carregando eventos do dia...</p>
          </div>
        )}

        {error && !current && <p className="text-xs text-loss">⚠️ {error}</p>}

        {!loading && !error && !events.length && (
          <p className="text-xs text-muted-foreground text-center py-6">Sem eventos econômicos programados para hoje.</p>
        )}

        {current && (() => {
          const meta = impactMeta[bucket(current.importance)];
          const time = new Date(current.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return (
            <div className="flex items-stretch gap-2">
              <button onClick={() => go(-1)} disabled={events.length <= 1}
                className="shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all w-8 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className={`flex-1 rounded-lg border p-3 ${meta.ring} transition-all`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{countryFlag[current.country] || '🌐'}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{current.country}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">{time}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 ${meta.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>

                <p className="text-sm font-semibold leading-snug mb-2 line-clamp-2">{current.title}</p>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded bg-muted/40 p-1.5">
                    <p className="text-[9px] uppercase text-muted-foreground">Anterior</p>
                    <p className="font-mono font-semibold truncate">{current.previous ?? '—'}{current.unit}</p>
                  </div>
                  <div className="rounded bg-muted/40 p-1.5">
                    <p className="text-[9px] uppercase text-muted-foreground">Previsão</p>
                    <p className="font-mono font-semibold truncate">{current.forecast ?? '—'}{current.unit}</p>
                  </div>
                  <div className={`rounded p-1.5 ${current.actual != null ? meta.chip : 'bg-muted/40'}`}>
                    <p className="text-[9px] uppercase opacity-75">Atual</p>
                    <p className="font-mono font-semibold truncate">{current.actual ?? '—'}{current.actual != null ? current.unit : ''}</p>
                  </div>
                </div>
              </div>

              <button onClick={() => go(1)} disabled={events.length <= 1}
                className="shrink-0 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all w-8 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          );
        })()}

        {events.length > 1 && (
          <div className="flex items-center justify-center gap-1 mt-3">
            {events.slice(0, Math.min(events.length, 12)).map((_, i) => (
              <button key={i} onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index % 12 ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60'}`}
                aria-label={`Ir para evento ${i + 1}`}
              />
            ))}
            {events.length > 12 && <span className="text-[9px] text-muted-foreground ml-1">+{events.length - 12}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

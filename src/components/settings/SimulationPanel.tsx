import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Play, CheckCircle2, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';

type Result = {
  id: string; kind: string; enabled: boolean; fire: boolean;
  title: string; reason: string; threshold: number | null;
  cooldown_minutes: number; message: string | null;
};

const KIND_LABELS: Record<string, string> = {
  patrimony_drop: 'Queda de patrimônio',
  patrimony_gain: 'Ganho de patrimônio',
  daily_valuation: 'Variação diária',
  roi_threshold: 'ROI acumulado',
  fx_stale: 'FX desatualizado',
  daily_summary: 'Resumo diário',
};

export function SimulationPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [context, setContext] = useState<any>(null);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('simulate-alert-rules', { body: {} });
      if (error) throw error;
      setResults(data.results ?? []);
      setContext(data.context ?? null);
    } catch (e: any) {
      toast.error(`Falha na simulação: ${e.message ?? e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Simulação de Alertas (dry-run)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Avalia todas as suas regras com os dados atuais e mostra quais mensagens seriam enviadas.
            Nenhuma notificação é disparada.
          </p>
        </div>
        <button onClick={run} disabled={running}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Simular agora
        </button>
      </div>

      {context && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <Stat label="Patrimônio" value={brl(context.totalValue)} />
          <Stat label="Anterior" value={brl(context.prevValue)} />
          <Stat label="Custo" value={brl(context.totalCost)} />
          <Stat label="Variação" value={pct(context.variationPct)} tone={context.variationPct >= 0 ? 'gain' : 'loss'} />
          <Stat label="ROI" value={pct(context.roiPct)} tone={context.roiPct >= 0 ? 'gain' : 'loss'} />
        </div>
      )}

      {results && (
        <div className="space-y-2">
          {results.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra configurada.</p>}
          {results.map(r => (
            <div key={r.id} className={`border rounded-lg p-3 ${r.fire ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}>
              <div className="flex items-center gap-2">
                {r.fire ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm">{KIND_LABELS[r.kind] ?? r.kind}</span>
                {!r.enabled && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">inativa</span>}
                <span className={`ml-auto text-xs font-semibold ${r.fire ? 'text-primary' : 'text-muted-foreground'}`}>
                  {r.fire ? 'DISPARARIA' : 'não dispara'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
              {r.message && (
                <pre className="mt-2 text-xs bg-background border border-border rounded p-2 whitespace-pre-wrap font-mono">{r.message}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : ''}`}>{value}</div>
    </div>
  );
}
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);
const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`;

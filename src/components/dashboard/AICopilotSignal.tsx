import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { Loader2, Sparkles, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';

interface CopilotSignal {
  signal: 'green' | 'yellow' | 'red';
  title: string;
  reasons: string[];
  suggestion: string;
  confidence: number;
}

interface Props {
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  avgPrice: number;
  currentPrice?: number;
  operation?: string;
  assets: Asset[];
}

const signalConfig = {
  green: {
    icon: ShieldCheck,
    bg: 'bg-gain/10 border-gain/30',
    text: 'text-gain',
    label: '✅ Sinal Verde',
  },
  yellow: {
    icon: Shield,
    bg: 'bg-warning/10 border-warning/30',
    text: 'text-warning-foreground',
    label: '⚠️ Atenção',
  },
  red: {
    icon: ShieldAlert,
    bg: 'bg-loss/10 border-loss/30',
    text: 'text-loss',
    label: '🔴 Alerta',
  },
};

export default function AICopilotSignal({ ticker, name, type, quantity, avgPrice, currentPrice, operation, assets }: Props) {
  const [signal, setSignal] = useState<CopilotSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    if (!ticker || !quantity || !avgPrice) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, name: a.name, type: a.type,
        quantity: a.quantity, avgPrice: a.avgPrice,
        currentPrice: a.currentPrice, allocation: a.allocation, sector: a.sector,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('ai-copilot', {
        body: { ticker, name, type, quantity, avgPrice, currentPrice, operation: operation || 'COMPRA', portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);
      setSignal(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na análise');
    } finally {
      setLoading(false);
    }
  }, [ticker, name, type, quantity, avgPrice, currentPrice, operation, assets]);

  if (!ticker || !quantity || !avgPrice) return null;

  if (!signal && !loading) {
    return (
      <button
        type="button"
        onClick={analyze}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-primary/30 text-primary text-xs font-medium hover:bg-primary/5 transition-all"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Analisar com IA antes de confirmar
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-muted/50 border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">IA analisando operação...</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-loss text-center py-2">⚠️ {error}</p>;
  }

  if (!signal) return null;

  const config = signalConfig[signal.signal];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${config.bg} animate-fade-in`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.text}`} />
          <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">Confiança: {signal.confidence}/10</span>
      </div>
      <p className="text-xs font-semibold">{signal.title}</p>
      <ul className="space-y-0.5">
        {signal.reasons.map((r, i) => (
          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
            <span className="mt-0.5">•</span>
            {r}
          </li>
        ))}
      </ul>
      <p className="text-[11px] font-medium border-t border-border/50 pt-1.5">{signal.suggestion}</p>
    </div>
  );
}

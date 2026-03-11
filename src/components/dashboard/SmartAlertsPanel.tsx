import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { useAIRateLimit } from '@/hooks/useAIRateLimit';
import {
  Zap, Loader2, RefreshCw, AlertTriangle, TrendingDown, Target,
  ShieldAlert, Eye, ArrowUpCircle, ArrowDownCircle, Activity,
} from 'lucide-react';

interface SmartAlert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  ticker?: string;
  action: string;
}

const typeIcons: Record<string, React.ElementType> = {
  unusual_drop: TrendingDown,
  concentration: AlertTriangle,
  divergence: Activity,
  take_profit: ArrowUpCircle,
  stop_loss: ArrowDownCircle,
  opportunity: Target,
  volume: Activity,
  pattern: Eye,
};

const severityStyles = {
  critical: 'border-loss/40 bg-loss/5',
  warning: 'border-warning/30 bg-warning/5',
  info: 'border-primary/20 bg-primary/5',
};

const severityBadge = {
  critical: 'bg-loss/20 text-loss',
  warning: 'bg-warning/20 text-warning',
  info: 'bg-primary/20 text-primary',
};

const actionLabels: Record<string, string> = {
  buy: '🟢 Comprar',
  sell: '🔴 Vender',
  hold: '🟡 Manter',
  monitor: '👁️ Monitorar',
  hedge: '🛡️ Proteger',
};

export default function SmartAlertsPanel({ assets }: { assets: Asset[] }) {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice,
        change24h: a.change24h, allocation: a.allocation, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('smart-alerts', {
        body: { portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setAlerts(result.alerts || []);
      setSummary(result.summary || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-loss/10 flex items-center justify-center">
            <Zap className="h-3.5 w-3.5 text-loss" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Alertas Inteligentes</h3>
            <p className="text-[10px] text-muted-foreground">Padrões detectados por IA</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading || assets.length === 0}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-loss hover:border-loss/30 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!alerts.length && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-loss transition-all">
            <Zap className="h-8 w-8" />
            <span className="text-xs">Detectar padrões na carteira</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-loss" />
            <p className="text-xs text-muted-foreground">Analisando padrões...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {summary && (
          <div className="rounded-lg bg-muted/50 border border-border p-2 mb-2">
            <p className="text-[11px] text-muted-foreground">{summary}</p>
          </div>
        )}

        {alerts.map((alert, i) => {
          const Icon = typeIcons[alert.type] || ShieldAlert;
          return (
            <div key={i} className={`rounded-lg border p-3 ${severityStyles[alert.severity]} transition-all hover:scale-[1.01]`}>
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                  alert.severity === 'critical' ? 'text-loss' :
                  alert.severity === 'warning' ? 'text-warning' : 'text-primary'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold">{alert.title}</p>
                    {alert.ticker && (
                      <span className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded">{alert.ticker}</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${severityBadge[alert.severity]}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{alert.description}</p>
                  <p className="text-[10px] mt-1.5 font-medium">
                    {actionLabels[alert.action] || alert.action}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

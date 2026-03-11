import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { Scale, Loader2, RefreshCw, ArrowUp, ArrowDown, Minus, AlertTriangle } from 'lucide-react';

interface AllocationItem {
  category: string;
  current_pct: number;
  ideal_pct: number;
  diff_pct: number;
}

interface Suggestion {
  action: 'buy' | 'sell' | 'hold';
  ticker: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface RebalanceData {
  summary: string;
  current_allocation: AllocationItem[];
  suggestions: Suggestion[];
}

const actionIcons = { buy: ArrowUp, sell: ArrowDown, hold: Minus };
const actionColors = { buy: 'text-gain', sell: 'text-loss', hold: 'text-muted-foreground' };
const actionLabels = { buy: 'Comprar', sell: 'Vender', hold: 'Manter' };
const priorityBg = { high: 'bg-loss/10 text-loss', medium: 'bg-warning/10 text-warning', low: 'bg-muted text-muted-foreground' };

export default function RebalancePanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<RebalanceData | null>(null);
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
      const { data: result, error: fnError } = await supabase.functions.invoke('portfolio-rebalance', {
        body: { portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-ai/10 flex items-center justify-center">
            <Scale className="h-3.5 w-3.5 text-ai" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Rebalanceamento IA</h3>
            <p className="text-[10px] text-muted-foreground">Alocação atual vs ideal</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading || assets.length === 0}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-ai hover:border-ai/30 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="p-4">
        {!data && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-ai transition-all">
            <Scale className="h-8 w-8" />
            <span className="text-xs">Clique para analisar</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-ai" />
            <p className="text-xs text-muted-foreground">Analisando alocação...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss text-center py-4">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground bg-ai/5 border border-ai/10 rounded-lg p-2">{data.summary}</p>

            {/* Allocation comparison */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Alocação</p>
              {data.current_allocation.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-24 truncate font-medium">{item.category}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(item.current_pct, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono">{item.current_pct.toFixed(0)}%</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <span className="w-10 font-mono text-primary">{item.ideal_pct.toFixed(0)}%</span>
                  <span className={`w-10 text-right font-mono ${item.diff_pct > 0 ? 'text-loss' : item.diff_pct < 0 ? 'text-gain' : 'text-muted-foreground'}`}>
                    {item.diff_pct > 0 ? '+' : ''}{item.diff_pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sugestões</p>
              {data.suggestions.map((sug, i) => {
                const Icon = actionIcons[sug.action];
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                    <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${actionColors[sug.action]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono">{sug.ticker}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${actionColors[sug.action]}`}>
                          {actionLabels[sug.action]}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${priorityBg[sug.priority]}`}>
                          {sug.priority}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{sug.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

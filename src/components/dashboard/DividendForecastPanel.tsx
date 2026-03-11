import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import {
  Loader2, TrendingUp, Sparkles, RefreshCw, Calendar,
  CircleDollarSign, ChevronDown, ChevronUp,
} from 'lucide-react';

interface DividendForecast {
  ticker: string;
  frequency: string;
  expected_yield: number;
  projected_per_share: number;
  projected_total: number;
  confidence: string;
  notes: string;
}

interface ForecastData {
  total_projected_12m: number;
  monthly_average: number;
  yield_on_cost: number;
  forecasts: DividendForecast[];
  insights: string;
}

export default function DividendForecastPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const holdings = assets.map(a => ({
        ticker: a.ticker, name: a.name, type: a.type,
        quantity: a.quantity, currentPrice: a.currentPrice,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('ai-dividend-forecast', {
        body: { holdings },
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

  const confBadge: Record<string, string> = {
    alta: 'bg-gain/10 text-gain',
    média: 'bg-warning/10 text-warning-foreground',
    baixa: 'bg-loss/10 text-loss',
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-ai/10 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 text-ai" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Projeção de Dividendos IA</h3>
            <p className="text-[10px] text-muted-foreground">Previsão para os próximos 12 meses</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading || assets.length === 0}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!data && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all">
            <Sparkles className="h-8 w-8" />
            <span className="text-xs font-medium">Projetar Dividendos com IA</span>
            <span className="text-[10px]">Estimativa baseada em padrões históricos</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Projetando dividendos...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-gain/5 border border-gain/10 p-2.5 text-center">
                <CircleDollarSign className="h-3.5 w-3.5 mx-auto text-gain mb-1" />
                <p className="text-[10px] text-muted-foreground">Projetado 12m</p>
                <p className="text-sm font-bold font-mono text-gain">{formatCurrency(data.total_projected_12m)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-2.5 text-center">
                <Calendar className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
                <p className="text-[10px] text-muted-foreground">Média Mensal</p>
                <p className="text-sm font-bold font-mono">{formatCurrency(data.monthly_average)}</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 text-center">
                <TrendingUp className="h-3.5 w-3.5 mx-auto text-primary mb-1" />
                <p className="text-[10px] text-muted-foreground">YoC</p>
                <p className="text-sm font-bold font-mono text-primary">{formatPercent(data.yield_on_cost)}</p>
              </div>
            </div>

            {/* Forecasts per asset */}
            <div>
              <button onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                <span>Projeção por Ativo ({data.forecasts.length})</span>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {expanded && (
                <div className="space-y-1.5">
                  {data.forecasts.map((f, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-muted/30 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{f.ticker}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${confBadge[f.confidence] || 'bg-muted'}`}>
                            {f.confidence}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{f.frequency} • DY {formatPercent(f.expected_yield)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-gain">{formatCurrency(f.projected_total)}</p>
                        <p className="text-[10px] text-muted-foreground">R${f.projected_per_share.toFixed(2)}/cota</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Insights */}
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Análise IA
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{data.insights}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

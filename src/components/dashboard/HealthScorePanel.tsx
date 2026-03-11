import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { useAIRateLimit } from '@/hooks/useAIRateLimit';
import { Heart, Loader2, RefreshCw, Sparkles, TrendingUp, TrendingDown, Shield, Lightbulb } from 'lucide-react';

interface HealthDimension {
  name: string;
  score: number;
  description: string;
}

interface HealthData {
  score: number;
  grade: string;
  summary: string;
  dimensions: HealthDimension[];
  recommendations: string[];
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-gain';
  if (score >= 60) return 'text-warning';
  return 'text-loss';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'from-gain/20 to-gain/5';
  if (score >= 60) return 'from-warning/20 to-warning/5';
  return 'from-loss/20 to-loss/5';
}

export default function HealthScorePanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canCall, recordCall } = useAIRateLimit();

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    if (!canCall()) return;
    setLoading(true);
    setError(null);
    recordCall();
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice,
        change24h: a.change24h, allocation: a.allocation, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('portfolio-health', {
        body: { portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar score');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gain/10 flex items-center justify-center">
            <Heart className="h-3.5 w-3.5 text-gain" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Saúde da Carteira</h3>
            <p className="text-[10px] text-muted-foreground">Score 0-100 via IA</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading || assets.every(a => a.currentPrice === 0)}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="p-4">
        {!data && !loading && !error && (
          <button
            onClick={generate}
            disabled={assets.every(a => a.currentPrice === 0)}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all"
          >
            <Heart className="h-8 w-8" />
            <span className="text-xs">Clique para analisar</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analisando saúde...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss text-center py-4">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            {/* Main Score */}
            <div className={`rounded-xl bg-gradient-to-br ${getScoreBg(data.score)} p-4 text-center`}>
              <div className={`text-4xl font-bold font-mono ${getScoreColor(data.score)}`}>
                {data.score}
              </div>
              <div className={`text-lg font-bold ${getScoreColor(data.score)}`}>{data.grade}</div>
              <p className="text-xs text-muted-foreground mt-1">{data.summary}</p>
            </div>

            {/* Dimensions */}
            <div className="space-y-2">
              {data.dimensions.map((dim, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium truncate">{dim.name}</span>
                      <span className={`text-[11px] font-mono font-bold ${getScoreColor(dim.score)}`}>{dim.score}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dim.score >= 80 ? 'bg-gain' : dim.score >= 60 ? 'bg-warning' : 'bg-loss'
                        }`}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{dim.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Recomendações
                </p>
                {data.recommendations.map((rec, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-primary/30">
                    {rec}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

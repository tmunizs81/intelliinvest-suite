import { useState, useEffect, useCallback } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';

interface ChartSummary {
  overview: string;
  trend_strength: 'forte' | 'moderada' | 'fraca';
  momentum: 'positivo' | 'negativo' | 'neutro';
  volatility: 'alta' | 'média' | 'baixa';
  key_levels: string;
  action_summary: string;
}

interface Props {
  ticker: string;
  name: string;
  type: string;
  candles: Candle[];
  loadDelay?: number;
}

export default function AIChartSummary({ ticker, name, type, candles, loadDelay = 0 }: Props) {
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTicker, setLastTicker] = useState('');

  const analyze = useCallback(async (retries = 3) => {
    if (candles.length < 20) return;
    setLoading(true);
    setError(null);

    const indicators = getLatestIndicators(candles);
    const recentCandles = candles.slice(-15).map(c => ({
      date: c.date,
      open: +c.open.toFixed(2),
      high: +c.high.toFixed(2),
      low: +c.low.toFixed(2),
      close: +c.close.toFixed(2),
      volume: c.volume,
    }));

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        const { data, error: fnError } = await supabase.functions.invoke('ai-chart-summary', {
          body: { ticker, name, type, indicators, recentCandles },
        });
        if (fnError) {
          if (fnError.message?.includes('429') && attempt < retries) continue;
          throw new Error(fnError.message);
        }
        if (data?.error) {
          if ((String(data.error).includes('Rate limit') || String(data.error).includes('429')) && attempt < retries) continue;
          throw new Error(data.error);
        }
        setSummary(data);
        setLastTicker(ticker);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          console.error('AI chart summary error:', err);
          setError(err instanceof Error ? err.message : 'Erro na análise');
        }
      }
    }
    setLoading(false);
  }, [ticker, name, type, candles]);

  useEffect(() => {
    if (ticker && ticker !== lastTicker && candles.length >= 20 && !loading) {
      analyze();
    }
  }, [ticker, candles.length]);

  if (!ticker || candles.length < 20) return null;

  const momentumColor = summary?.momentum === 'positivo' ? 'text-gain' : summary?.momentum === 'negativo' ? 'text-loss' : 'text-warning-foreground';
  const MomentumIcon = summary?.momentum === 'positivo' ? TrendingUp : summary?.momentum === 'negativo' ? TrendingDown : Minus;
  const trendColor = summary?.trend_strength === 'forte' ? 'text-primary' : summary?.trend_strength === 'moderada' ? 'text-warning-foreground' : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden mt-4">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Resumo IA do Gráfico</h3>
        </div>
        <button
          onClick={() => analyze()}
          disabled={loading}
          className="h-7 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium flex items-center gap-1.5 hover:bg-primary/20 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
          {loading ? 'Analisando...' : 'Atualizar'}
        </button>
      </div>

      {loading && !summary && (
        <div className="p-6 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Analisando indicadores do gráfico...</span>
        </div>
      )}

      {error && !summary && (
        <div className="p-4 text-xs text-loss">⚠️ {error}</div>
      )}

      {summary && (
        <div className="p-4 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
              <MomentumIcon className={`h-3.5 w-3.5 ${momentumColor}`} />
              <span className="text-xs font-medium">Momentum: </span>
              <span className={`text-xs font-bold capitalize ${momentumColor}`}>{summary.momentum}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
              <BarChart3 className={`h-3.5 w-3.5 ${trendColor}`} />
              <span className="text-xs font-medium">Tendência: </span>
              <span className={`text-xs font-bold capitalize ${trendColor}`}>{summary.trend_strength}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
              <span className="text-xs font-medium">Volatilidade: </span>
              <span className={`text-xs font-bold capitalize ${
                summary.volatility === 'alta' ? 'text-loss' : summary.volatility === 'baixa' ? 'text-gain' : 'text-warning-foreground'
              }`}>{summary.volatility}</span>
            </div>
          </div>

          {/* Overview */}
          <p className="text-sm leading-relaxed text-foreground/90">{summary.overview}</p>

          {/* Key levels */}
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">Níveis Chave</p>
            <p className="text-xs text-foreground/80">{summary.key_levels}</p>
          </div>

          {/* Action */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-[10px] uppercase text-primary font-semibold mb-1">💡 Conclusão</p>
            <p className="text-sm font-medium text-foreground">{summary.action_summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}

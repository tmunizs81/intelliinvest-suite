import { useState } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, Target, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';
import { formatCurrency } from '@/lib/mockData';

const analysisCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

interface AIAnalysis {
  trend: 'alta' | 'baixa' | 'lateral';
  recommendation: string;
  confidence: number;
  summary: string;
  analysis: string;
  support?: number;
  resistance?: number;
  targetPrice?: number;
  stopLoss?: number;
}

interface Props {
  ticker: string;
  name: string;
  type: string;
  candles: Candle[];
  holdingInfo?: {
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    profitPct: number;
  };
}

const recommendationLabels: Record<string, { label: string; color: string; bg: string }> = {
  compra_forte: { label: 'COMPRA FORTE', color: 'text-gain', bg: 'bg-gain/10 border-gain/30' },
  compra: { label: 'COMPRA', color: 'text-gain', bg: 'bg-gain/10 border-gain/20' },
  manter: { label: 'MANTER', color: 'text-warning-foreground', bg: 'bg-warning/10 border-warning/20' },
  venda: { label: 'VENDA', color: 'text-loss', bg: 'bg-loss/10 border-loss/20' },
  venda_forte: { label: 'VENDA FORTE', color: 'text-loss', bg: 'bg-loss/10 border-loss/30' },
};

export default function AIAnalysisPanel({ ticker, name, type, candles, holdingInfo }: Props) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (retries = 3) => {
    if (candles.length < 20) {
      setError('Dados históricos insuficientes para análise (mínimo 20 candles)');
      return;
    }

    setLoading(true);
    setError(null);

    const indicators = getLatestIndicators(candles);
    const recentCandles = candles.slice(-10).map(c => ({
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
        const { data, error: fnError } = await supabase.functions.invoke('ai-asset-analysis', {
          body: {
            ticker, name, type, indicators, recentCandles,
            holdingInfo: holdingInfo ? { ...holdingInfo, profitPct: +holdingInfo.profitPct.toFixed(2) } : undefined,
          },
        });
        if (fnError) {
          if (fnError.message?.includes('429') && attempt < retries) continue;
          throw new Error(fnError.message);
        }
        if (data?.error) {
          if ((String(data.error).includes('Rate limit') || String(data.error).includes('429')) && attempt < retries) continue;
          throw new Error(data.error);
        }
        setAnalysis(data);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          console.error('AI analysis error:', err);
          setError(err instanceof Error ? err.message : 'Erro na análise IA');
        }
      }
    }
    setLoading(false);
  };

  const TrendIcon = analysis?.trend === 'alta' ? TrendingUp : analysis?.trend === 'baixa' ? TrendingDown : Minus;
  const trendColor = analysis?.trend === 'alta' ? 'text-gain' : analysis?.trend === 'baixa' ? 'text-loss' : 'text-warning-foreground';
  const rec = analysis ? recommendationLabels[analysis.recommendation] || recommendationLabels.manter : null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-ai-accent-foreground" />
          <h2 className="text-sm font-semibold">Análise IA</h2>
        </div>
        <button
          onClick={() => handleAnalyze()}
          disabled={loading}
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          {loading ? 'Analisando...' : analysis ? 'Reanalisar' : 'Gerar Análise'}
        </button>
      </div>

      {error && (
        <div className="p-4 border-b border-loss/20 bg-loss/5 text-xs text-loss-foreground">
          ⚠️ {error}
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="p-8 text-center">
          <Brain className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            Clique em "Gerar Análise" para obter uma análise técnica completa com IA
          </p>
        </div>
      )}

      {loading && (
        <div className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Analisando {ticker} com inteligência artificial...</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="p-4 space-y-4">
          {/* Summary + Recommendation */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <TrendIcon className={`h-5 w-5 ${trendColor}`} />
                <span className={`text-sm font-semibold capitalize ${trendColor}`}>
                  Tendência de {analysis.trend}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({analysis.confidence}% confiança)
                </span>
              </div>
              <p className="text-sm text-foreground">{analysis.summary}</p>
            </div>
            {rec && (
              <div className={`px-3 py-2 rounded-lg border text-center ${rec.bg}`}>
                <p className={`text-xs font-bold ${rec.color}`}>{rec.label}</p>
              </div>
            )}
          </div>

          {/* Price levels */}
          {(analysis.support || analysis.resistance || analysis.targetPrice || analysis.stopLoss) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {analysis.support && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Shield className="h-3 w-3 text-primary" />
                    <span className="text-[10px] text-muted-foreground uppercase">Suporte</span>
                  </div>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(analysis.support)}</p>
                </div>
              )}
              {analysis.resistance && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Target className="h-3 w-3 text-warning-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase">Resistência</span>
                  </div>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(analysis.resistance)}</p>
                </div>
              )}
              {analysis.targetPrice && (
                <div className="rounded-lg bg-gain/5 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp className="h-3 w-3 text-gain" />
                    <span className="text-[10px] text-muted-foreground uppercase">Alvo</span>
                  </div>
                  <p className="text-sm font-mono font-semibold text-gain">{formatCurrency(analysis.targetPrice)}</p>
                </div>
              )}
              {analysis.stopLoss && (
                <div className="rounded-lg bg-loss/5 p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown className="h-3 w-3 text-loss" />
                    <span className="text-[10px] text-muted-foreground uppercase">Stop Loss</span>
                  </div>
                  <p className="text-sm font-mono font-semibold text-loss">{formatCurrency(analysis.stopLoss)}</p>
                </div>
              )}
            </div>
          )}

          {/* Full analysis text */}
          <div className="rounded-lg bg-muted/30 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Análise Detalhada</h3>
            <div className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
              {analysis.analysis}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

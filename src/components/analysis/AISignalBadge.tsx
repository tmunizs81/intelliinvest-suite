import { useState, useEffect, useCallback } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';
import { formatCurrency } from '@/lib/mockData';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';

const signalCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

interface SignalData {
  trend: 'alta' | 'baixa' | 'lateral';
  recommendation: string;
  confidence: number;
  summary: string;
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
  loadDelay?: number;
  holdingInfo?: {
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    profitPct: number;
  };
}

const recConfig: Record<string, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  compra_forte: { label: 'COMPRA FORTE', emoji: '🟢', bg: 'bg-gain/15', text: 'text-gain', border: 'border-gain/40' },
  compra: { label: 'COMPRA', emoji: '🟢', bg: 'bg-gain/10', text: 'text-gain', border: 'border-gain/30' },
  manter: { label: 'MANTER', emoji: '🟡', bg: 'bg-warning/10', text: 'text-warning-foreground', border: 'border-warning/30' },
  venda: { label: 'VENDA', emoji: '🔴', bg: 'bg-loss/10', text: 'text-loss', border: 'border-loss/30' },
  venda_forte: { label: 'VENDA FORTE', emoji: '🔴', bg: 'bg-loss/15', text: 'text-loss', border: 'border-loss/40' },
};

export default function AISignalBadge({ ticker, name, type, candles, loadDelay = 0, holdingInfo }: Props) {
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTicker, setLastTicker] = useState('');

  const analyze = useCallback(async (retries = 3, skipCache = false) => {
    if (candles.length < 20) return;
    const cached = signalCache.get(ticker);
    if (!skipCache && cached && Date.now() - cached.ts < CACHE_TTL) {
      setSignal(cached.data);
      setLastTicker(ticker);
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
        signalCache.set(ticker, { data, ts: Date.now() });
        setSignal(data);
        setLastTicker(ticker);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          console.error('AI signal error:', err);
          setError(err instanceof Error ? err.message : 'Erro na análise');
        }
      }
    }
    setLoading(false);
  }, [ticker, name, type, candles, holdingInfo]);

  useEffect(() => {
    if (ticker && ticker !== lastTicker && candles.length >= 20 && !loading) {
      const timer = setTimeout(() => {
        enqueueAIRequest(() => analyze());
      }, loadDelay > 0 ? loadDelay : 0);
      return () => clearTimeout(timer);
    }
  }, [ticker, candles.length, loadDelay]);

  if (!ticker) return null;

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card animate-pulse">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="text-xs font-medium text-muted-foreground">IA analisando {ticker}...</p>
        </div>
      </div>
    );
  }

  // Error or no data yet
  if (error) {
    return (
      <button
        onClick={() => analyze()}
        className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-loss/30 bg-loss/5 hover:bg-loss/10 transition-colors"
      >
        <Brain className="h-4 w-4 text-loss" />
        <span className="text-xs text-loss">Erro na análise. Clique para tentar novamente.</span>
      </button>
    );
  }

  if (!signal) {
    if (candles.length < 20) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border bg-muted/30">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Aguardando dados para análise IA...</span>
        </div>
      );
    }
    return null;
  }

  const rec = recConfig[signal.recommendation] || recConfig.manter;
  const TrendIcon = signal.trend === 'alta' ? TrendingUp : signal.trend === 'baixa' ? TrendingDown : Minus;
  const trendColor = signal.trend === 'alta' ? 'text-gain' : signal.trend === 'baixa' ? 'text-loss' : 'text-warning-foreground';

  return (
    <div className={`rounded-xl border ${rec.border} ${rec.bg} p-4 space-y-3`}>
      {/* Main signal row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-12 w-12 rounded-xl ${rec.bg} border ${rec.border}`}>
            <Brain className={`h-6 w-6 ${rec.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{rec.emoji}</span>
              <span className={`text-lg font-bold tracking-tight ${rec.text}`}>
                {rec.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
              <span className={`text-xs font-medium capitalize ${trendColor}`}>
                Tendência de {signal.trend}
              </span>
              <span className="text-[10px] text-muted-foreground">
                • {signal.confidence}% confiança
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => analyze(3, true)}
          disabled={loading}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          title="Reanalisar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground/80 leading-relaxed">{signal.summary}</p>

      {/* Price targets */}
      {(signal.targetPrice || signal.stopLoss || signal.support || signal.resistance) && (
        <div className="flex flex-wrap gap-3 pt-1">
          {signal.targetPrice && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-gain" />
              <span className="text-[11px] text-muted-foreground">Alvo:</span>
              <span className="text-xs font-mono font-semibold text-gain">{formatCurrency(signal.targetPrice)}</span>
            </div>
          )}
          {signal.stopLoss && (
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-loss" />
              <span className="text-[11px] text-muted-foreground">Stop:</span>
              <span className="text-xs font-mono font-semibold text-loss">{formatCurrency(signal.stopLoss)}</span>
            </div>
          )}
          {signal.support && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Suporte:</span>
              <span className="text-xs font-mono font-semibold">{formatCurrency(signal.support)}</span>
            </div>
          )}
          {signal.resistance && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Resistência:</span>
              <span className="text-xs font-mono font-semibold">{formatCurrency(signal.resistance)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

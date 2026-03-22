import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { Star, Loader2, RefreshCw, TrendingUp, TrendingDown, Crown, AlertTriangle } from 'lucide-react';

interface AssetScore {
  ticker: string;
  valuation: number;
  momentum: number;
  dividends: number;
  risk: number;
  overall: number;
  summary: string;
}

interface ScoringData {
  scores: AssetScore[];
  topPick: string;
  worstPick: string;
  insight: string;
}

function getScoreColor(score: number) {
  if (score >= 8) return 'text-gain';
  if (score >= 6) return 'text-warning';
  if (score >= 4) return 'text-orange-400';
  return 'text-loss';
}

function getScoreBg(score: number) {
  if (score >= 8) return 'bg-gain';
  if (score >= 6) return 'bg-warning';
  if (score >= 4) return 'bg-orange-400';
  return 'bg-loss';
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-muted-foreground w-14 text-right shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getScoreBg(value)}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono font-bold w-5 ${getScoreColor(value ?? 0)}`}>{value ?? 0}</span>
    </div>
  );
}

function StarRating({ score }: { score: number }) {
  const full = Math.floor(score / 2);
  const half = score % 2 >= 1;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < full
              ? 'text-warning fill-warning'
              : i === full && half
              ? 'text-warning fill-warning/50'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

export default function AssetScoringPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<ScoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, name: a.name, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice,
        change24h: a.change24h, allocation: a.allocation, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('ai-scoring', {
        body: { portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar scoring');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  const sorted = data?.scores?.slice().sort((a, b) => b.overall - a.overall) || [];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Scoring IA</h3>
            <p className="text-[10px] text-muted-foreground">Nota 1-10 por ativo</p>
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

      <div className="flex-1 overflow-auto p-3">
        {!data && !loading && !error && (
          <button
            onClick={generate}
            disabled={assets.every(a => a.currentPrice === 0)}
            className="w-full py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all"
          >
            <Star className="h-8 w-8" />
            <span className="text-xs">Clique para classificar ativos</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-8 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analisando ativos...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss text-center py-4">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-3">
            {/* Insight */}
            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">{data.insight}</p>

            {/* Top & Worst picks */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-gain/10 border border-gain/20 p-2 flex items-center gap-2">
                <Crown className="h-4 w-4 text-gain shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Melhor</p>
                  <p className="text-xs font-bold text-gain">{data.topPick}</p>
                </div>
              </div>
              <div className="rounded-lg bg-loss/10 border border-loss/20 p-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-loss shrink-0" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Atenção</p>
                  <p className="text-xs font-bold text-loss">{data.worstPick}</p>
                </div>
              </div>
            </div>

            {/* Scores list */}
            <div className="space-y-3">
              {sorted.map((s, i) => (
                <div
                  key={s.ticker}
                  className={`rounded-lg border p-2.5 transition-all ${
                    s.ticker === data.topPick
                      ? 'border-gain/30 bg-gain/5'
                      : s.ticker === data.worstPick
                      ? 'border-loss/30 bg-loss/5'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">#{i + 1}</span>
                      <span className="text-xs font-bold">{s.ticker}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating score={s.overall} />
                      <span className={`text-sm font-bold font-mono ${getScoreColor(s.overall)}`}>
                        {s.overall.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <ScoreBar value={s.valuation} label="Valuation" />
                    <ScoreBar value={s.momentum} label="Momento" />
                    <ScoreBar value={s.dividends} label="Dividendo" />
                    <ScoreBar value={s.risk} label="Risco" />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1.5">{s.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

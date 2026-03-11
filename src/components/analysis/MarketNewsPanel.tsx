import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const cache = new Map<string, { data: MarketOpinion; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
import {
  Loader2, RefreshCw, Newspaper, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Shield, AlertTriangle, ThumbsUp, ThumbsDown,
  Globe, Zap, Target
} from 'lucide-react';

interface MarketOpinion {
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'cautious';
  sentiment_label: string;
  executive_summary: string;
  market_position: string;
  positive_catalysts: string[];
  negative_catalysts: string[];
  relevant_news: Array<{
    title: string;
    impact: 'positive' | 'negative' | 'neutral';
    summary: string;
    source?: string;
  }>;
  conclusion: string;
  confidence: number;
}

interface Props {
  ticker: string;
  name: string;
  type: string;
}

const sentimentConfig = {
  bullish: { color: 'text-gain', bg: 'bg-gain/10 border-gain/30', icon: TrendingUp, label: '🟢' },
  bearish: { color: 'text-loss', bg: 'bg-loss/10 border-loss/30', icon: TrendingDown, label: '🔴' },
  neutral: { color: 'text-muted-foreground', bg: 'bg-muted/50 border-border', icon: Minus, label: '🟡' },
  cautious: { color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/30', icon: Shield, label: '🟠' },
};

const impactIcons = { positive: TrendingUp, negative: TrendingDown, neutral: Minus };
const impactColors = {
  positive: 'border-gain/20 bg-gain/5',
  negative: 'border-loss/20 bg-loss/5',
  neutral: 'border-border bg-muted/20',
};
const impactTextColors = { positive: 'text-gain', negative: 'text-loss', neutral: 'text-muted-foreground' };

export default function MarketNewsPanel({ ticker, name, type }: Props) {
  const [opinion, setOpinion] = useState<MarketOpinion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNews, setShowNews] = useState(true);
  const [lastTicker, setLastTicker] = useState(ticker);

  if (ticker !== lastTicker) {
    setLastTicker(ticker);
    setOpinion(null);
    setError(null);
    setLoading(false);
    setShowNews(true);
  }

  const fetchOpinion = useCallback(async (retries = 3) => {
    setLoading(true);
    setError(null);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        const { data, error: fnError } = await supabase.functions.invoke('ai-market-news', {
          body: { ticker, name, type },
        });
        if (fnError) {
          if (fnError.message?.includes('429') && attempt < retries) continue;
          throw new Error(fnError.message);
        }
        if (data?.error) {
          if ((String(data.error).includes('Rate limit') || String(data.error).includes('429')) && attempt < retries) continue;
          throw new Error(data.error);
        }
        setOpinion(data);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          setError(err instanceof Error ? err.message : 'Erro');
        }
      }
    }
    setLoading(false);
  }, [ticker, name, type]);

  const cfg = opinion ? sentimentConfig[opinion.sentiment] : null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
            <Globe className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Notícias de Mercado</h2>
            <p className="text-[10px] text-muted-foreground">Varredura IA em portais financeiros</p>
          </div>
        </div>
        <button onClick={() => fetchOpinion()} disabled={loading}
          className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!opinion && !loading && !error && (
        <button onClick={() => fetchOpinion()}
          className="w-full py-10 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-all">
          <Newspaper className="h-10 w-10" />
          <span className="text-sm font-medium">Analisar notícias de mercado sobre {ticker}</span>
          <span className="text-[11px] text-muted-foreground">Google News, InfoMoney, Valor Econômico + opinião IA</span>
        </button>
      )}

      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Varrendo portais financeiros...</p>
          <p className="text-[10px] text-muted-foreground">Google News, InfoMoney, Valor Econômico</p>
        </div>
      )}

      {error && <div className="p-4"><p className="text-sm text-loss">⚠️ {error}</p></div>}

      {opinion && cfg && (
        <div className="divide-y divide-border">
          {/* Sentiment Badge */}
          <div className={`p-4 border ${cfg.bg} rounded-none`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
                <span className={`text-lg font-bold ${cfg.color}`}>
                  {cfg.label} {opinion.sentiment_label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Confiança: <span className="font-mono font-semibold text-foreground">{opinion.confidence}%</span>
                </span>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{opinion.executive_summary}</p>
          </div>

          {/* Market Position */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-primary" /> Posição de Mercado
            </h3>
            <p className="text-sm leading-relaxed">{opinion.market_position}</p>
          </div>

          {/* Catalysts */}
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ThumbsUp className="h-3 w-3 text-gain" /> Catalisadores Positivos
              </h3>
              <div className="space-y-1.5">
                {opinion.positive_catalysts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-gain/5 border border-gain/10">
                    <span className="text-gain text-xs mt-0.5">▲</span>
                    <span className="text-xs">{c}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ThumbsDown className="h-3 w-3 text-loss" /> Riscos / Catalisadores Negativos
              </h3>
              <div className="space-y-1.5">
                {opinion.negative_catalysts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-loss/5 border border-loss/10">
                    <AlertTriangle className="h-3 w-3 text-loss mt-0.5 shrink-0" />
                    <span className="text-xs">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Relevant News */}
          <div className="p-4">
            <button onClick={() => setShowNews(!showNews)}
              className="w-full flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Newspaper className="h-3 w-3 text-primary" /> Notícias Relevantes ({opinion.relevant_news.length})
              </h3>
              {showNews ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showNews && (
              <div className="space-y-1.5">
                {opinion.relevant_news.map((news, i) => {
                  const NIcon = impactIcons[news.impact];
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${impactColors[news.impact]}`}>
                      <div className="flex items-start gap-2">
                        <NIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${impactTextColors[news.impact]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-snug">{news.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{news.summary}</p>
                          {news.source && (
                            <span className="text-[9px] text-muted-foreground mt-1 block">{news.source}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conclusion */}
          <div className="p-4 bg-muted/20">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Conclusão</h3>
            <p className="text-sm leading-relaxed font-medium">{opinion.conclusion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

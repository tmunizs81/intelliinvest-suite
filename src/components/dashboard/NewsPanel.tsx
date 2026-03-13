import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { checkAIProviderFallback } from '@/lib/aiProviderToast';
import { Newspaper, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Globe, Building, Landmark, Scale as ScaleIcon, ExternalLink } from 'lucide-react';

interface NewsItem {
  title: string;
  summary: string;
  impact: 'positive' | 'negative' | 'neutral';
  related_tickers: string[];
  category: string;
  source_url?: string;
}

interface CachedNewsPayload {
  timestamp: number;
  news: NewsItem[];
}

const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

function getNewsCacheKey(tickers: string[]) {
  return `news-cache:${[...tickers].sort().join(',')}`;
}

function readCachedNews(cacheKey: string, allowExpired = false): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedNewsPayload;
    if (!parsed || !Array.isArray(parsed.news) || typeof parsed.timestamp !== 'number') {
      return null;
    }

    const expired = Date.now() - parsed.timestamp > NEWS_CACHE_TTL_MS;
    if (expired && !allowExpired) return null;

    return parsed.news;
  } catch {
    return null;
  }
}

function writeCachedNews(cacheKey: string, news: NewsItem[]) {
  try {
    const payload: CachedNewsPayload = {
      timestamp: Date.now(),
      news,
    };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // ignore cache write issues
  }
}

const impactColors = {
  positive: 'border-gain/30 bg-gain/5',
  negative: 'border-loss/30 bg-loss/5',
  neutral: 'border-border bg-muted/30',
};
const impactIcons = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: Minus,
};
const impactTextColors = {
  positive: 'text-gain',
  negative: 'text-loss',
  neutral: 'text-muted-foreground',
};
const categoryIcons: Record<string, React.ElementType> = {
  macro: Landmark,
  setorial: Building,
  global: Globe,
  regulatório: ScaleIcon,
};

export default function NewsPanel({ assets }: { assets: Asset[] }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;

    const tickers = assets
      .map((a) => a.ticker)
      .filter((ticker): ticker is string => Boolean(ticker))
      .slice(0, 10);

    if (!tickers.length) return;

    const cacheKey = getNewsCacheKey(tickers);
    const cachedFresh = readCachedNews(cacheKey);
    if (cachedFresh?.length) {
      setNews(cachedFresh);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('ai-news', {
        body: { tickers },
      });

      if (fnError) throw new Error('Falha ao buscar notícias em tempo real');
      if (result?.error) throw new Error(result.error);

      checkAIProviderFallback(result);

      const freshNews = Array.isArray(result?.news) ? result.news : [];
      setNews(freshNews);

      if (freshNews.length) {
        writeCachedNews(cacheKey, freshNews);
      }
    } catch (err) {
      const staleCache = readCachedNews(cacheKey, true);
      if (staleCache?.length) {
        setNews(staleCache);
        setError('Falha ao atualizar agora. Exibindo notícias em cache local.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro');
      }
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center">
            <Newspaper className="h-3.5 w-3.5 text-secondary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Feed de Notícias</h3>
            <p className="text-[10px] text-muted-foreground">Fontes reais: Google News, InfoMoney, Valor</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading || assets.length === 0}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!news.length && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-all">
            <Newspaper className="h-8 w-8" />
            <span className="text-xs">Buscar notícias reais da sua carteira</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Buscando notícias reais...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {news.map((item, i) => {
          const Icon = impactIcons[item.impact];
          const CatIcon = categoryIcons[item.category] || Newspaper;
          return (
            <div key={i} className={`rounded-lg border p-3 ${impactColors[item.impact]} transition-all hover:scale-[1.01]`}>
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${impactTextColors[item.impact]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold leading-snug">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{item.summary}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                      <CatIcon className="h-2.5 w-2.5" /> {item.category}
                    </span>
                    {item.related_tickers.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{t}</span>
                    ))}
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-primary flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-2.5 w-2.5" /> Fonte
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

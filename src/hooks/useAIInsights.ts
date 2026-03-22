import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, type AIInsight } from '@/lib/mockData';
import { checkAIProviderFallback } from '@/lib/aiProviderToast';
import { getCached, setCache, CACHE_TTL } from '@/lib/persistentCache';

interface AIInsightsResult {
  insights: AIInsight[];
  summary: string;
}

export function useAIInsights() {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const generateInsights = useCallback(async (assets: Asset[]) => {
    if (assets.length === 0 || assets.every(a => a.currentPrice === 0)) return;

    setLoading(true);
    setError(null);

    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker,
        name: a.name,
        type: a.type,
        quantity: a.quantity,
        avgPrice: a.avgPrice,
        currentPrice: a.currentPrice,
        change24h: a.change24h,
        allocation: a.allocation,
        sector: a.sector,
      }));

      // Check persistent cache first
      const tickers = assets.map(a => a.ticker).sort().join(',');
      const cacheKey = `ai-insights:${tickers}`;
      const cached = await getCached<AIInsightsResult>(cacheKey);
      if (cached) {
        setInsights(cached.insights);
        setSummary(cached.summary);
        setLastGenerated(new Date());
        setLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('ai-insights', {
        body: { portfolio },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Falha ao gerar insights');
      }
      checkAIProviderFallback(data);

      if (data.error && !data._fallback) {
        throw new Error(data.error);
      }

      const enrichedInsights: AIInsight[] = (data.insights || []).map((ins: any, i: number) => ({
        id: `ai-${i}-${Date.now()}`,
        type: ins.type || 'analysis',
        title: ins.title,
        description: ins.description,
        severity: ins.severity || 'info',
        ticker: ins.ticker,
        timestamp: new Date().toISOString(),
      }));

      setInsights(enrichedInsights);
      setSummary(data.summary || '');
      setLastGenerated(new Date());

      // Cache the result
      await setCache(cacheKey, { insights: enrichedInsights, summary: data.summary || '' }, CACHE_TTL.AI_RESPONSE);
    } catch (err) {
      console.error('AI insights error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar insights');
    } finally {
      setLoading(false);
    }
  }, []);

  return { insights, summary, loading, error, lastGenerated, generateInsights };
}

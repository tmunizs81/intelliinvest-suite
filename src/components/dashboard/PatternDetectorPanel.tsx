import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { checkAIProviderFallback } from '@/lib/aiProviderToast';
import { Loader2, Search, Sparkles, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Pattern {
  ticker: string;
  pattern: string;
  type: 'bullish' | 'bearish' | 'neutral';
  reliability: string;
  description: string;
  target?: string;
}

export default function PatternDetectorPanel({ assets }: { assets: Asset[] }) {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const tickers = assets.map(a => a.ticker).slice(0, 10);
      const { data, error: fnError } = await supabase.functions.invoke('ai-pattern-detector', {
        body: { tickers, assets: assets.slice(0, 10).map(a => ({ ticker: a.ticker, name: a.name, currentPrice: a.currentPrice, change24h: a.change24h })) },
      });
      if (fnError) throw new Error(fnError.message);
      setPatterns(data?.patterns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  const iconMap = { bullish: TrendingUp, bearish: TrendingDown, neutral: Minus };
  const colorMap = { bullish: 'text-gain', bearish: 'text-loss', neutral: 'text-muted-foreground' };
  const bgMap = { bullish: 'bg-gain/10 border-gain/20', bearish: 'bg-loss/10 border-loss/20', neutral: 'bg-muted/50 border-border' };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Detecta padrões gráficos nos seus ativos via IA</p>
        <button onClick={detect} disabled={loading || assets.length === 0}
          className="h-7 px-3 rounded-md border border-border flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Detectar
        </button>
      </div>

      {!patterns.length && !loading && !error && (
        <button onClick={detect} disabled={assets.length === 0}
          className="w-full py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all">
          <Sparkles className="h-8 w-8" />
          <span className="text-xs font-medium">Detectar Padrões Gráficos</span>
          <span className="text-[10px]">OCO, Triângulos, Bandeiras, Suporte/Resistência</span>
        </button>
      )}

      {loading && (
        <div className="flex flex-col items-center py-8 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Analisando padrões gráficos...</p>
        </div>
      )}

      {error && <p className="text-xs text-loss">⚠️ {error}</p>}

      {patterns.length > 0 && !loading && (
        <div className="space-y-2">
          {patterns.map((p, i) => {
            const Icon = iconMap[p.type] || Minus;
            return (
              <div key={i} className={`rounded-lg border p-3 ${bgMap[p.type]}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${colorMap[p.type]}`} />
                    <span className="font-mono font-bold text-sm">{p.ticker}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.reliability}</span>
                </div>
                <p className="text-xs font-medium">{p.pattern}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{p.description}</p>
                {p.target && <p className="text-[10px] font-mono mt-1">Alvo: {p.target}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

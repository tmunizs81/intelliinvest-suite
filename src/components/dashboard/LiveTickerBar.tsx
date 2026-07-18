import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { Radio, TrendingUp, TrendingDown, Minus, Pause, Play } from 'lucide-react';
import { useYahooStream } from '@/hooks/useYahooStream';

interface Props {
  assets: Asset[];
  onPricesUpdate?: (prices: Record<string, { price: number; change: number }>) => void;
}

export default function LiveTickerBar({ assets, onPricesUpdate }: Props) {
  const [prices, setPrices] = useState<Record<string, { price: number; change: number; name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const FALLBACK_INTERVAL = 5 * 60_000; // 5 min — usado só se WS cair

  const tickerList = useMemo(() => assets.map(a => a.ticker).slice(0, 20), [assets]);
  const { quotes: streamQuotes, connected } = useYahooStream(paused ? [] : tickerList);

  // Bootstrap com REST (para preencher name/preço BRL antes do 1º tick do WS)
  const fetchPrices = useCallback(async () => {
    if (tickerList.length === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers: tickerList },
      });
      if (error) throw error;
      const quotes = data?.quotes || {};
      const newPrices: Record<string, { price: number; change: number; name: string }> = {};
      const updateMap: Record<string, { price: number; change: number }> = {};
      for (const [ticker, quote] of Object.entries(quotes) as [string, any][]) {
        newPrices[ticker] = {
          price: quote.currentPriceBRL || quote.currentPrice || 0,
          change: quote.change24h || 0,
          name: quote.name || ticker,
        };
        updateMap[ticker] = { price: newPrices[ticker].price, change: newPrices[ticker].change };
      }
      setPrices(prev => ({ ...prev, ...newPrices }));
      onPricesUpdate?.(updateMap);
    } catch (err) {
      console.error('LiveTicker error:', err);
    } finally {
      setLoading(false);
    }
  }, [tickerList, onPricesUpdate]);

  // Bootstrap inicial
  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // Fallback: só faz polling se o WS não conectar
  useEffect(() => {
    if (paused || connected || tickerList.length === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(fetchPrices, FALLBACK_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, connected, fetchPrices, tickerList.length]);

  // Aplica ticks do WebSocket sobre o estado local
  useEffect(() => {
    const ids = Object.keys(streamQuotes);
    if (ids.length === 0) return;
    setPrices(prev => {
      const next = { ...prev };
      const updateMap: Record<string, { price: number; change: number }> = {};
      for (const id of ids) {
        const q = streamQuotes[id];
        const existing = prev[id];
        next[id] = {
          price: q.price,
          change: q.changePercent ?? existing?.change ?? 0,
          name: existing?.name ?? id,
        };
        updateMap[id] = { price: next[id].price, change: next[id].change };
      }
      onPricesUpdate?.(updateMap);
      return next;
    });
  }, [streamQuotes, onPricesUpdate]);

  const tickers = Object.entries(prices);
  if (tickers.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Radio className={`h-3 w-3 ${loading ? 'text-primary animate-pulse' : connected ? 'text-gain animate-pulse' : 'text-muted-foreground'}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cotações ao Vivo
        </span>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {paused ? 'Pausado' : connected ? 'Streaming em tempo real' : 'Polling (fallback)'}
        </span>
        <button
          onClick={() => setPaused(!paused)}
          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max animate-fade-in">
          {tickers.map(([ticker, data]) => {
            const isPositive = data.change > 0;
            const isNegative = data.change < 0;
            const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
            const color = isPositive ? 'text-gain' : isNegative ? 'text-loss' : 'text-muted-foreground';

            return (
              <div
                key={ticker}
                className="flex items-center gap-2 px-3 py-2 border-r border-border/50 last:border-r-0 hover:bg-muted/30 transition-colors"
              >
                <span className="text-[11px] font-mono font-semibold text-foreground">{ticker}</span>
                <span className="text-[11px] font-mono text-foreground">
                  {formatCurrency(data.price)}
                </span>
                <span className={`text-[10px] font-mono font-medium flex items-center gap-0.5 ${color}`}>
                  <Icon className="h-2.5 w-2.5" />
                  {isPositive ? '+' : ''}{data.change.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

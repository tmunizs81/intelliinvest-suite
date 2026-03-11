import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { Radio, TrendingUp, TrendingDown, Minus, Pause, Play } from 'lucide-react';

interface Props {
  assets: Asset[];
  onPricesUpdate?: (prices: Record<string, { price: number; change: number }>) => void;
}

export default function LiveTickerBar({ assets, onPricesUpdate }: Props) {
  const [prices, setPrices] = useState<Record<string, { price: number; change: number; name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const REFRESH_INTERVAL = 30_000; // 30 seconds

  const fetchPrices = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    try {
      const tickers = assets.map(a => a.ticker).slice(0, 20);
      const { data, error } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers },
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

      setPrices(newPrices);
      setLastFetch(new Date());
      setCountdown(REFRESH_INTERVAL / 1000);
      onPricesUpdate?.(updateMap);
    } catch (err) {
      console.error('LiveTicker error:', err);
    } finally {
      setLoading(false);
    }
  }, [assets, onPricesUpdate]);

  // Initial fetch
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Auto-refresh
  useEffect(() => {
    if (paused || assets.length === 0) return;
    intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, fetchPrices, assets.length]);

  // Countdown
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, lastFetch]);

  const tickers = Object.entries(prices);
  if (tickers.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Radio className={`h-3 w-3 ${loading ? 'text-primary animate-pulse' : 'text-gain'}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cotações ao Vivo
        </span>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {paused ? 'Pausado' : `Atualiza em ${countdown}s`}
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

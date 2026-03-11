import { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RateData {
  pair: string;
  label: string;
  flag: string;
  rate: number;
  change: number;
  prevClose: number;
}

const PAIRS = [
  { pair: 'USDBRL=X', label: 'USD/BRL', flag: '🇺🇸', name: 'Dólar Americano' },
  { pair: 'EURBRL=X', label: 'EUR/BRL', flag: '🇪🇺', name: 'Euro' },
  { pair: 'GBPBRL=X', label: 'GBP/BRL', flag: '🇬🇧', name: 'Libra Esterlina' },
];

export default function CurrencyDashboard() {
  const [rates, setRates] = useState<RateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const results: RateData[] = [];

      for (const p of PAIRS) {
        try {
          const resp = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${p.pair}?interval=1d&range=2d`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            }
          );

          // If direct fetch fails (CORS), use edge function
          if (!resp.ok) throw new Error('Direct fetch failed');

          const data = await resp.json();
          const meta = data.chart?.result?.[0]?.meta;
          if (meta) {
            const rate = meta.regularMarketPrice || 0;
            const prevClose = meta.chartPreviousClose || meta.previousClose || rate;
            const change = prevClose > 0 ? ((rate - prevClose) / prevClose) * 100 : 0;
            results.push({
              pair: p.label,
              label: p.name,
              flag: p.flag,
              rate,
              change: Math.round(change * 100) / 100,
              prevClose,
            });
          }
        } catch {
          // Fallback: use our yahoo-finance edge function
          try {
            const { data } = await supabase.functions.invoke('yahoo-finance', {
              body: { tickers: [p.pair.replace('=X', '')] },
            });
            const quote = data?.quotes?.[p.pair.replace('=X', '')];
            if (quote) {
              results.push({
                pair: p.label,
                label: p.name,
                flag: p.flag,
                rate: quote.currentPrice,
                change: quote.change24h,
                prevClose: quote.previousClose,
              });
            }
          } catch {
            results.push({
              pair: p.label,
              label: p.name,
              flag: p.flag,
              rate: 0,
              change: 0,
              prevClose: 0,
            });
          }
        }
      }

      setRates(results);
      setLastUpdate(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Câmbio
        </h3>
        <button
          onClick={fetchRates}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {loading && rates.length === 0 ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {rates.map((r) => {
            const isPositive = r.change >= 0;
            return (
              <div
                key={r.pair}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{r.flag}</span>
                  <div>
                    <p className="text-xs font-semibold">{r.pair}</p>
                    <p className="text-[10px] text-muted-foreground">{r.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold">
                    {r.rate > 0
                      ? new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                          minimumFractionDigits: 4,
                        }).format(r.rate)
                      : '—'}
                  </p>
                  {r.rate > 0 && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${
                        isPositive ? 'text-gain' : 'text-loss'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowDownRight className="h-2.5 w-2.5" />
                      )}
                      {isPositive ? '+' : ''}
                      {r.change.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastUpdate && (
        <p className="text-[10px] text-muted-foreground text-right">
          Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

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
  format: 'BRL' | 'USD';
}

const CURRENCY_PAIRS = [
  { ticker: 'USDBRL', label: 'USD/BRL', flag: 'US', name: 'Dólar Americano', format: 'BRL' as const },
  { ticker: 'EURBRL', label: 'EUR/BRL', flag: 'EU', name: 'Euro', format: 'BRL' as const },
  { ticker: 'GBPBRL', label: 'GBP/BRL', flag: 'GB', name: 'Libra Esterlina', format: 'BRL' as const },
];

const STABLECOIN_PAIRS = [
  { ticker: 'USDT', label: 'USDT/USD', flag: '₮', name: 'Tether', format: 'USD' as const },
  { ticker: 'USDC', label: 'USDC/USD', flag: '◈', name: 'USD Coin', format: 'USD' as const },
];

export default function CurrencyDashboard() {
  const [rates, setRates] = useState<RateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const results: RateData[] = [];

      // Fetch currency rates via edge function
      const { data: currencyData } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers: CURRENCY_PAIRS.map(p => p.ticker), mode: 'currency' },
      });

      for (const p of CURRENCY_PAIRS) {
        const quote = currencyData?.quotes?.[p.ticker];
        results.push({
          pair: p.label,
          label: p.name,
          flag: p.flag,
          rate: quote?.currentPrice ?? 0,
          change: quote?.change24h ?? 0,
          prevClose: quote?.previousClose ?? 0,
          format: p.format,
        });
      }

      // Fetch stablecoins via edge function (CoinGecko)
      const { data: cryptoData } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers: STABLECOIN_PAIRS.map(p => p.ticker), mode: 'crypto' },
      });

      for (const p of STABLECOIN_PAIRS) {
        const quote = cryptoData?.quotes?.[p.ticker];
        results.push({
          pair: p.label,
          label: p.name,
          flag: p.flag,
          rate: quote?.currentPrice ?? 0,
          change: quote?.change24h ?? 0,
          prevClose: quote?.previousClose ?? 0,
          format: p.format,
        });
      }

      setRates(results);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Currency fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (rate: number, format: 'BRL' | 'USD') => {
    if (rate <= 0) return '—';
    return new Intl.NumberFormat(format === 'BRL' ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency: format,
      minimumFractionDigits: 4,
    }).format(rate);
  };

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
                  <span className="text-sm font-bold text-muted-foreground w-6 text-center">{r.flag}</span>
                  <div>
                    <p className="text-xs font-semibold">{r.pair}</p>
                    <p className="text-[10px] text-muted-foreground">{r.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold">
                    {formatPrice(r.rate, r.format)}
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

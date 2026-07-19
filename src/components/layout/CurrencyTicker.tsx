import { useEffect, useState } from 'react';
import { DollarSign, Euro, Bitcoin, Coins } from 'lucide-react';

type Quote = { label: string; value: number | null; icon: React.ComponentType<{ className?: string }>; prefix?: string; digits?: number };

const CACHE_KEY = 'currency_ticker_v1';
const ONE_HOUR = 60 * 60 * 1000;

async function fetchQuotes(): Promise<Quote[]> {
  const [awesome, gold, btc] = await Promise.allSettled([
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL').then(r => r.json()),
    fetch('https://api.gold-api.com/price/XAU').then(r => r.json()).catch(() =>
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd').then(r => r.json())
    ),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd').then(r => r.json()),
  ]);

  const usd = awesome.status === 'fulfilled' ? parseFloat(awesome.value?.USDBRL?.bid) : null;
  const eur = awesome.status === 'fulfilled' ? parseFloat(awesome.value?.EURBRL?.bid) : null;

  let goldVal: number | null = null;
  if (gold.status === 'fulfilled') {
    goldVal = gold.value?.price ?? gold.value?.['tether-gold']?.usd ?? null;
  }

  const btcVal = btc.status === 'fulfilled' ? btc.value?.bitcoin?.usd ?? null : null;

  return [
    { label: 'USD/BRL', value: usd, icon: DollarSign, prefix: 'R$ ', digits: 4 },
    { label: 'EUR/BRL', value: eur, icon: Euro, prefix: 'R$ ', digits: 4 },
    { label: 'Ouro/USD', value: goldVal, icon: Coins, prefix: '$ ', digits: 2 },
    { label: 'BTC/USD', value: btcVal, icon: Bitcoin, prefix: '$ ', digits: 0 },
  ];
}

export default function CurrencyTicker() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // Hydrate from cache
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < ONE_HOUR && Array.isArray(parsed.data)) {
          // rebuild icons (not serializable)
          const icons = [DollarSign, Euro, Coins, Bitcoin];
          setQuotes(parsed.data.map((q: any, i: number) => ({ ...q, icon: icons[i] })));
        }
      }
    } catch {}

    const load = async () => {
      try {
        const q = await fetchQuotes();
        setQuotes(q);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), data: q.map(({ icon, ...rest }) => rest) })
        );
      } catch (e) {
        console.error('CurrencyTicker fetch error', e);
      }
    };

    load();
    const refresh = setInterval(load, ONE_HOUR);
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (quotes.length === 0) return;
    const rotate = setInterval(() => setIdx(i => (i + 1) % quotes.length), 3500);
    return () => clearInterval(rotate);
  }, [quotes.length]);

  if (quotes.length === 0) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-muted-foreground">
        <span className="animate-pulse">Cotações...</span>
      </div>
    );
  }

  const q = quotes[idx];
  const Icon = q.icon;
  const formatted =
    q.value == null
      ? '—'
      : `${q.prefix ?? ''}${q.value.toLocaleString('pt-BR', {
          minimumFractionDigits: q.digits ?? 2,
          maximumFractionDigits: q.digits ?? 2,
        })}`;

  return (
    <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-card border border-border min-w-[180px]">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-medium">{q.label}</span>
      </div>
      <span className="text-xs font-semibold tabular-nums ml-auto">{formatted}</span>
      <div className="flex gap-0.5">
        {quotes.map((_, i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full transition-colors ${
              i === idx ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

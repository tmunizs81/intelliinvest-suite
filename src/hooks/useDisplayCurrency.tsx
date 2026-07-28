import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DollarSign, Banknote, Euro } from 'lucide-react';

export type DisplayCurrency = 'BRL' | 'USD' | 'EUR';

interface FxRates {
  /** How many BRL for 1 USD */
  USD_BRL: number;
  /** How many BRL for 1 EUR */
  EUR_BRL: number;
}

interface Ctx {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  cycle: () => void;
  fx: FxRates;
  /** Convert a BRL value into the currently selected display currency. */
  convert: (brl: number) => number;
  /** Format a BRL value into the currently selected display currency string. */
  format: (brl: number) => string;
  symbol: string;
  /** Timestamp (ms since epoch) of the FX rates currently in use. */
  fxUpdatedAt: number | null;
}

const DEFAULT_FX: FxRates = { USD_BRL: 5.5, EUR_BRL: 6.0 };
const STORAGE_KEY = 'display_currency_v1';
const FX_CACHE_KEY = 'display_currency_fx_v1';
const FX_TTL = 60 * 60 * 1000; // 1h

const DisplayCurrencyContext = createContext<Ctx | null>(null);

async function fetchFx(): Promise<FxRates> {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL');
    const j = await r.json();
    const usd = parseFloat(j?.USDBRL?.bid);
    const eur = parseFloat(j?.EURBRL?.bid);
    if (usd > 0 && eur > 0) return { USD_BRL: usd, EUR_BRL: eur };
  } catch { /* noop */ }
  return DEFAULT_FX;
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() => {
    if (typeof window === 'undefined') return 'BRL';
    return (localStorage.getItem(STORAGE_KEY) as DisplayCurrency) || 'BRL';
  });
  const [fx, setFx] = useState<FxRates>(() => {
    if (typeof window === 'undefined') return DEFAULT_FX;
    try {
      const raw = localStorage.getItem(FX_CACHE_KEY);
      if (!raw) return DEFAULT_FX;
      const { rates, ts } = JSON.parse(raw);
      if (Date.now() - ts < FX_TTL && rates?.USD_BRL && rates?.EUR_BRL) return rates;
    } catch { /* noop */ }
    return DEFAULT_FX;
  });
  const [fxUpdatedAt, setFxUpdatedAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(FX_CACHE_KEY);
      if (!raw) return null;
      const { ts } = JSON.parse(raw);
      return typeof ts === 'number' ? ts : null;
    } catch { return null; }
  });

  const setCurrency = useCallback((c: DisplayCurrency) => {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }, []);

  const cycle = useCallback(() => {
    const order: DisplayCurrency[] = ['BRL', 'USD', 'EUR'];
    setCurrency(order[(order.indexOf(currency) + 1) % order.length]);
  }, [currency, setCurrency]);

  useEffect(() => {
    let cancelled = false;
    const persist = (rates: FxRates, ts: number) => {
      try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rates, ts })); } catch { /* noop */ }
    };
    (async () => {
      const rates = await fetchFx();
      if (cancelled) return;
      const ts = Date.now();
      setFx(rates); setFxUpdatedAt(ts); persist(rates, ts);
    })();
    const id = setInterval(async () => {
      const rates = await fetchFx();
      const ts = Date.now();
      setFx(rates); setFxUpdatedAt(ts); persist(rates, ts);
    }, FX_TTL);
    return () => { cancelled = true; clearInterval(id); };
  }, []);


  const convert = useCallback((brl: number) => {
    if (!isFinite(brl)) return 0;
    if (currency === 'BRL') return brl;
    if (currency === 'USD') return brl / (fx.USD_BRL || DEFAULT_FX.USD_BRL);
    return brl / (fx.EUR_BRL || DEFAULT_FX.EUR_BRL);
  }, [currency, fx]);

  const format = useCallback((brl: number) => {
    const val = convert(brl);
    const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(val);
  }, [currency, convert]);

  const symbol = currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : '€';

  const value = useMemo<Ctx>(() => ({ currency, setCurrency, cycle, fx, convert, format, symbol, fxUpdatedAt }),
    [currency, setCurrency, cycle, fx, convert, format, symbol, fxUpdatedAt]);

  return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency(): Ctx {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) {
    // Safe fallback for components rendered outside the provider (tests, isolated previews).
    return {
      currency: 'BRL',
      setCurrency: () => {},
      cycle: () => {},
      fx: DEFAULT_FX,
      convert: (v) => v,
      format: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v),
      symbol: 'R$',
      fxUpdatedAt: null,
    };
  }
  return ctx;
}

const ICONS: Record<DisplayCurrency, React.ComponentType<{ className?: string }>> = {
  BRL: Banknote,
  USD: DollarSign,
  EUR: Euro,
};

const LABELS: Record<DisplayCurrency, string> = { BRL: 'BRL', USD: 'USD', EUR: 'EUR' };

/**
 * Compact segmented toggle: BRL / USD / EUR.
 * Reads/writes to the DisplayCurrency context.
 */
export function CurrencyToggle({ className = '' }: { className?: string }) {
  const { currency, setCurrency } = useDisplayCurrency();
  const order: DisplayCurrency[] = ['BRL', 'USD', 'EUR'];
  return (
    <div
      role="radiogroup"
      aria-label="Moeda de exibição"
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-card/80 p-0.5 shadow-sm backdrop-blur ${className}`}
    >
      {order.map((c) => {
        const Icon = ICONS[c];
        const active = currency === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setCurrency(c)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all ${
              active
                ? 'bg-primary text-primary-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={`Exibir valores em ${LABELS[c]}`}
          >
            <Icon className="h-3 w-3" />
            {LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Building2, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatPercent } from '@/lib/mockData';

interface FundamentalData {
  pe?: number | null;
  pb?: number | null;
  roe?: number | null;
  dividendYield?: number | null;
  evEbitda?: number | null;
  netMargin?: number | null;
  grossMargin?: number | null;
  debtToEquity?: number | null;
  currentRatio?: number | null;
  marketCap?: number | null;
  eps?: number | null;
  revenue?: number | null;
  ebitda?: number | null;
  freeCashFlow?: number | null;
  bookValue?: number | null;
  beta?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  avgVolume?: number | null;
  payout?: number | null;
}

interface Props {
  ticker: string;
  type: string;
}

function Stat({ label, value, suffix, signal }: { label: string; value: string | null; suffix?: string; signal?: 'good' | 'bad' | 'neutral' }) {
  const color = signal === 'good' ? 'text-[hsl(var(--gain-foreground))]' : signal === 'bad' ? 'text-[hsl(var(--loss-foreground))]' : 'text-foreground';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-medium ${color}`}>
        {value ?? '—'}{suffix || ''}
      </span>
    </div>
  );
}

export default function FundamentalIndicators({ ticker, type }: Props) {
  const [data, setData] = useState<FundamentalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFundamentals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: resp, error: fnError } = await supabase.functions.invoke('yahoo-finance-fundamentals', {
        body: { ticker, type },
      });
      if (fnError) throw new Error(fnError.message);
      if (resp.error) throw new Error(resp.error);
      setData(resp);
    } catch (err) {
      console.error('Fundamentals error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
    } finally {
      setLoading(false);
    }
  }, [ticker, type]);

  useEffect(() => {
    fetchFundamentals();
  }, [fetchFundamentals]);

  const fmt = (v?: number | null, decimals = 2) => v != null ? v.toFixed(decimals) : null;
  const fmtBig = (v?: number | null) => {
    if (v == null) return null;
    if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
    return formatCurrency(v);
  };

  const isFII = type === 'FII';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{isFII ? 'Indicadores FII' : 'Indicadores Fundamentalistas'}</h2>
        </div>
        <button
          onClick={fetchFundamentals}
          disabled={loading}
          className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>

      {error && (
        <div className="p-3 border-b border-[hsl(var(--loss)/0.2)] bg-[hsl(var(--loss)/0.05)] text-xs text-[hsl(var(--loss-foreground))]">
          ⚠️ {error}
        </div>
      )}

      {loading && !data ? (
        <div className="p-8 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      ) : data ? (
        <div className="p-4 space-y-0">
          {isFII ? (
            <>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Valuation</h3>
              <Stat label="P/VP" value={fmt(data.pb)} signal={data.pb != null ? (data.pb < 1 ? 'good' : data.pb > 1.3 ? 'bad' : 'neutral') : undefined} />
              <Stat label="Dividend Yield" value={fmt(data.dividendYield)} suffix="%" signal={data.dividendYield != null ? (data.dividendYield > 8 ? 'good' : 'neutral') : undefined} />
              <Stat label="Valor Patrimonial" value={data.bookValue != null ? formatCurrency(data.bookValue) : null} />
              <Stat label="Market Cap" value={fmtBig(data.marketCap)} />

              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 mt-4">Preço</h3>
              <Stat label="Máxima 52 sem" value={data.fiftyTwoWeekHigh != null ? formatCurrency(data.fiftyTwoWeekHigh) : null} />
              <Stat label="Mínima 52 sem" value={data.fiftyTwoWeekLow != null ? formatCurrency(data.fiftyTwoWeekLow) : null} />
              <Stat label="Volume Médio" value={data.avgVolume != null ? `${(data.avgVolume / 1e3).toFixed(0)}K` : null} />
              <Stat label="Beta" value={fmt(data.beta)} />
            </>
          ) : (
            <>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Valuation</h3>
              <Stat label="P/L" value={fmt(data.pe)} signal={data.pe != null ? (data.pe < 10 ? 'good' : data.pe > 25 ? 'bad' : 'neutral') : undefined} />
              <Stat label="P/VP" value={fmt(data.pb)} signal={data.pb != null ? (data.pb < 1.5 ? 'good' : data.pb > 3 ? 'bad' : 'neutral') : undefined} />
              <Stat label="EV/EBITDA" value={fmt(data.evEbitda)} />
              <Stat label="LPA" value={data.eps != null ? formatCurrency(data.eps) : null} />

              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 mt-4">Rentabilidade</h3>
              <Stat label="ROE" value={fmt(data.roe)} suffix="%" signal={data.roe != null ? (data.roe > 15 ? 'good' : data.roe < 5 ? 'bad' : 'neutral') : undefined} />
              <Stat label="Margem Líquida" value={fmt(data.netMargin)} suffix="%" signal={data.netMargin != null ? (data.netMargin > 15 ? 'good' : data.netMargin < 5 ? 'bad' : 'neutral') : undefined} />
              <Stat label="Dividend Yield" value={fmt(data.dividendYield)} suffix="%" signal={data.dividendYield != null ? (data.dividendYield > 5 ? 'good' : 'neutral') : undefined} />

              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 mt-4">Saúde Financeira</h3>
              <Stat label="Dívida/PL" value={fmt(data.debtToEquity)} signal={data.debtToEquity != null ? (data.debtToEquity < 0.5 ? 'good' : data.debtToEquity > 1.5 ? 'bad' : 'neutral') : undefined} />
              <Stat label="Market Cap" value={fmtBig(data.marketCap)} />
              <Stat label="Receita" value={fmtBig(data.revenue)} />
              <Stat label="EBITDA" value={fmtBig(data.ebitda)} />
              <Stat label="Free Cash Flow" value={fmtBig(data.freeCashFlow)} />

              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 mt-4">Preço</h3>
              <Stat label="Máxima 52 sem" value={data.fiftyTwoWeekHigh != null ? formatCurrency(data.fiftyTwoWeekHigh) : null} />
              <Stat label="Mínima 52 sem" value={data.fiftyTwoWeekLow != null ? formatCurrency(data.fiftyTwoWeekLow) : null} />
              <Stat label="Beta" value={fmt(data.beta)} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

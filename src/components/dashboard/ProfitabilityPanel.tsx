import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { TrendingUp, TrendingDown, Loader2, BarChart3 } from 'lucide-react';

interface BenchmarkResult {
  name: string;
  return_pct: number;
  difference_pct: number;
  is_beating: boolean;
}

interface PerformerItem {
  ticker: string;
  return_pct: number;
}

interface ProfitabilityData {
  period_label: string;
  portfolio_return_pct: number;
  portfolio_return_value: number;
  benchmarks: BenchmarkResult[];
  top_performers: PerformerItem[];
  worst_performers: PerformerItem[];
  analysis: string;
}

const periods = [
  { key: '1M', label: '1 Mês' },
  { key: '3M', label: '3 Meses' },
  { key: '6M', label: '6 Meses' },
  { key: '1A', label: '1 Ano' },
  { key: '2A', label: '2 Anos' },
  { key: 'Total', label: 'Total' },
];

export default function ProfitabilityPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<ProfitabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('6M');

  const generate = useCallback(async (period: string) => {
    if (assets.length === 0) return;
    setSelectedPeriod(period);
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('profitability', {
        body: { portfolio, period, benchmarks: ['CDI', 'IBOV', 'IPCA'] },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Rentabilidade vs Benchmarks</h3>
          <p className="text-[10px] text-muted-foreground">Compare com CDI, IBOV, IPCA</p>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Period selector */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {periods.map(p => (
            <button key={p.key} onClick={() => generate(p.key)}
              className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                selectedPeriod === p.key && data
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {!data && !loading && !error && (
          <button onClick={() => generate(selectedPeriod)} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all">
            <BarChart3 className="h-8 w-8" />
            <span className="text-xs">Selecione o período para analisar</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Calculando rentabilidade...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            {/* Portfolio return */}
            <div className="text-center py-3 rounded-xl bg-gradient-to-br from-primary/10 to-transparent">
              <p className="text-[10px] text-muted-foreground">{data.period_label}</p>
              <p className={`text-3xl font-bold font-mono ${data.portfolio_return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {data.portfolio_return_pct >= 0 ? '+' : ''}{data.portfolio_return_pct.toFixed(2)}%
              </p>
              <p className={`text-sm font-mono ${data.portfolio_return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {formatCurrency(data.portfolio_return_value)}
              </p>
            </div>

            {/* Benchmarks */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">vs Benchmarks</p>
              {data.benchmarks.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    {b.is_beating ? (
                      <TrendingUp className="h-3.5 w-3.5 text-gain" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-loss" />
                    )}
                    <span className="text-xs font-medium">{b.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{b.return_pct.toFixed(2)}%</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${b.is_beating ? 'text-gain' : 'text-loss'}`}>
                    {b.difference_pct >= 0 ? '+' : ''}{b.difference_pct.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Top/Worst */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">🏆 Top</p>
                {data.top_performers.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span className="font-mono">{p.ticker}</span>
                    <span className="font-mono text-gain">{p.return_pct >= 0 ? '+' : ''}{p.return_pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">📉 Piores</p>
                {data.worst_performers.slice(0, 3).map((p, i) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span className="font-mono">{p.ticker}</span>
                    <span className="font-mono text-loss">{p.return_pct >= 0 ? '+' : ''}{p.return_pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2">{data.analysis}</p>
          </div>
        )}
      </div>
    </div>
  );
}

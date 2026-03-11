import { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Loader2, BarChart3, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatPercent, mockPortfolioHistory } from '@/lib/mockData';

type RangeOption = '3mo' | '6mo' | '1y' | '2y';

interface BenchmarkData {
  dates: string[];
  values: number[];
}

interface Props {
  assets: Asset[];
}

const COLORS = {
  portfolio: 'hsl(160, 84%, 39%)',
  ibovespa: 'hsl(210, 80%, 60%)',
  dolar: 'hsl(38, 92%, 50%)',
  cdi: 'hsl(270, 70%, 60%)',
};

const LABELS: Record<string, string> = {
  portfolio: 'Sua Carteira',
  ibovespa: 'Ibovespa',
  dolar: 'Dólar',
  cdi: 'CDI',
};

export default function PerformanceChart({ assets }: Props) {
  const [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>('1y');
  const [visible, setVisible] = useState({ portfolio: true, ibovespa: true, dolar: true, cdi: true });

  const fetchBenchmarks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('benchmarks', {
        body: { range },
      });
      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);
      setBenchmarks(data.benchmarks || {});
    } catch (err) {
      console.error('Benchmarks error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar benchmarks');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchBenchmarks();
  }, [fetchBenchmarks]);

  // Build portfolio performance as % return, using mock history scaled to current value
  const portfolioPerf = useMemo(() => {
    const currentTotal = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    if (currentTotal === 0) return { dates: [] as string[], values: [] as number[] };

    const historyLast = mockPortfolioHistory[mockPortfolioHistory.length - 1]?.value || 1;
    const scale = currentTotal / historyLast;

    const rangeDays: Record<RangeOption, number> = { '3mo': 90, '6mo': 180, '1y': 365, '2y': 730 };
    const sliced = mockPortfolioHistory.slice(-rangeDays[range]);
    const scaledValues = sliced.map(p => p.value * scale);
    const base = scaledValues[0] || 1;

    return {
      dates: sliced.map(p => p.date),
      values: scaledValues.map(v => ((v / base) - 1) * 100),
    };
  }, [assets, range]);

  // Merge all series into chart-ready data
  const chartData = useMemo(() => {
    // Use ibovespa dates as primary reference
    const refDates = benchmarks.ibovespa?.dates || portfolioPerf.dates;
    if (refDates.length === 0) return [];

    // Build lookup maps
    const makeMap = (dates: string[], values: number[]) => {
      const map = new Map<string, number>();
      dates.forEach((d, i) => map.set(d, values[i]));
      return map;
    };

    const portfolioMap = makeMap(portfolioPerf.dates, portfolioPerf.values);
    const ibovMap = makeMap(benchmarks.ibovespa?.dates || [], benchmarks.ibovespa?.values || []);
    const dolarMap = makeMap(benchmarks.dolar?.dates || [], benchmarks.dolar?.values || []);
    const cdiMap = makeMap(benchmarks.cdi?.dates || [], benchmarks.cdi?.values || []);

    return refDates.map(date => ({
      date,
      portfolio: portfolioMap.get(date) ?? null,
      ibovespa: ibovMap.get(date) ?? null,
      dolar: dolarMap.get(date) ?? null,
      cdi: cdiMap.get(date) ?? null,
    }));
  }, [benchmarks, portfolioPerf]);

  const ranges: { value: RangeOption; label: string }[] = [
    { value: '3mo', label: '3M' },
    { value: '6mo', label: '6M' },
    { value: '1y', label: '1A' },
    { value: '2y', label: '2A' },
  ];

  const toggleVisibility = (key: string) => {
    setVisible(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-xl">
        <p className="font-medium mb-2">{new Date(label).toLocaleDateString('pt-BR')}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{LABELS[entry.dataKey]}</span>
            </div>
            <span className="font-mono font-medium" style={{ color: entry.color }}>
              {formatPercent(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Performance Comparativa</h2>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {ranges.map(r => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  range === r.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle buttons */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleVisibility(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                visible[key as keyof typeof visible]
                  ? 'border-border bg-card'
                  : 'border-transparent bg-muted/50 opacity-50'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }} />
              {label}
              {visible[key as keyof typeof visible] ? (
                <Eye className="h-3 w-3 text-muted-foreground" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 border-b border-loss/20 bg-loss/5 text-xs text-loss-foreground">
          ⚠️ {error}
        </div>
      )}

      <div className="p-4" style={{ height: 380 }}>
        {loading && chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando benchmarks...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Sem dados disponíveis
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'hsl(215, 12%, 50%)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => {
                  const parts = v.split('-');
                  return `${parts[2]}/${parts[1]}`;
                }}
                interval={Math.max(1, Math.floor(chartData.length / 10))}
              />
              <YAxis
                tick={{ fill: 'hsl(215, 12%, 50%)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={50}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <Tooltip content={<CustomTooltip />} />

              {visible.portfolio && (
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke={COLORS.portfolio}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              )}
              {visible.ibovespa && (
                <Line
                  type="monotone"
                  dataKey="ibovespa"
                  stroke={COLORS.ibovespa}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              )}
              {visible.dolar && (
                <Line
                  type="monotone"
                  dataKey="dolar"
                  stroke={COLORS.dolar}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              )}
              {visible.cdi && (
                <Line
                  type="monotone"
                  dataKey="cdi"
                  stroke={COLORS.cdi}
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="5 3"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary cards */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
          {Object.entries(LABELS).map(([key, label]) => {
            const values = chartData.map(d => d[key as keyof typeof d] as number | null).filter(v => v !== null) as number[];
            const lastVal = values[values.length - 1] ?? 0;
            const isPositive = lastVal >= 0;

            return (
              <div key={key} className="p-4 border-r border-border last:border-r-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                </div>
                <p className={`text-lg font-mono font-bold ${isPositive ? 'text-gain' : 'text-loss'}`}>
                  {formatPercent(lastVal)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

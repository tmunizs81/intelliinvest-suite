import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { type SnapshotRow } from '@/hooks/usePortfolioSnapshots';
import { BarChart3, Loader2, TrendingUp } from 'lucide-react';

const RANGES = ['3m', '6m', '1y', '2y'] as const;
const RANGE_LABELS: Record<string, string> = { '3m': '3M', '6m': '6M', '1y': '1A', '2y': '2A' };

interface BenchmarkData {
  ibovespa: { dates: string[]; values: number[] };
  dolar: { dates: string[]; values: number[] };
  cdi: { dates: string[]; values: number[] };
}

interface Props {
  snapshots: SnapshotRow[];
}

export default function BenchmarkChart({ snapshots }: Props) {
  const [range, setRange] = useState<string>('1y');
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke('benchmarks', { body: { range } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.benchmarks) {
          setBenchmarks(data.benchmarks);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range]);

  const chartData = useMemo(() => {
    if (!benchmarks) return [];

    // Build a date-indexed map
    const dateMap = new Map<string, any>();

    // Add portfolio data (normalized to % return)
    if (snapshots.length > 1) {
      const baseValue = snapshots[0].total_value;
      snapshots.forEach(s => {
        const pct = baseValue > 0 ? ((s.total_value / baseValue) - 1) * 100 : 0;
        const existing = dateMap.get(s.snapshot_date) || {};
        dateMap.set(s.snapshot_date, { ...existing, date: s.snapshot_date, carteira: Number(pct.toFixed(2)) });
      });
    }

    // Add benchmark data
    const addBenchmark = (key: string, dates: string[], values: number[]) => {
      dates.forEach((d, i) => {
        const existing = dateMap.get(d) || {};
        dateMap.set(d, { ...existing, date: d, [key]: Number(values[i]?.toFixed(2) ?? 0) });
      });
    };

    addBenchmark('ibovespa', benchmarks.ibovespa.dates, benchmarks.ibovespa.values);
    addBenchmark('cdi', benchmarks.cdi.dates, benchmarks.cdi.values);
    addBenchmark('dolar', benchmarks.dolar.dates, benchmarks.dolar.values);

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [benchmarks, snapshots]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Carteira vs Benchmarks</h2>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                r === range ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <TrendingUp className="h-8 w-8" />
          <p className="text-sm">Dados insuficientes para comparação</p>
        </div>
      ) : (
        <div className="flex-1 min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,16%)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => {
                  const d = new Date(v + 'T12:00:00');
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
                stroke="hsl(215,12%,50%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                stroke="hsl(215,12%,50%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(220,18%,9%)',
                  border: '1px solid hsl(220,14%,16%)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                }}
                labelFormatter={(v) => new Date(v + 'T12:00:00').toLocaleDateString('pt-BR')}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    carteira: '📊 Carteira',
                    ibovespa: '📈 IBOV',
                    cdi: '💰 CDI',
                    dolar: '💵 Dólar',
                  };
                  return [`${value.toFixed(2)}%`, labels[name] || name];
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    carteira: 'Minha Carteira',
                    ibovespa: 'IBOV',
                    cdi: 'CDI',
                    dolar: 'Dólar',
                  };
                  return labels[value] || value;
                }}
              />
              {snapshots.length > 1 && (
                <Line type="monotone" dataKey="carteira" stroke="hsl(263,70%,60%)" strokeWidth={2.5} dot={false} connectNulls />
              )}
              <Line type="monotone" dataKey="ibovespa" stroke="hsl(160,84%,39%)" strokeWidth={1.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="cdi" stroke="hsl(45,93%,55%)" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 4" />
              <Line type="monotone" dataKey="dolar" stroke="hsl(200,80%,55%)" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

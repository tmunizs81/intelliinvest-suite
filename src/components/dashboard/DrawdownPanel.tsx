import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatPercent } from '@/lib/mockData';
import { TrendingDown } from 'lucide-react';

interface Props {
  snapshots: Array<{ snapshot_date: string; total_value: number }>;
  loading?: boolean;
}

export default function DrawdownPanel({ snapshots, loading }: Props) {
  const data = useMemo(() => {
    if (!snapshots?.length) return { chart: [], maxDrawdown: 0, currentDrawdown: 0, recoveryDays: 0 };

    const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    let peak = sorted[0].total_value;
    let maxDd = 0;
    let ddStart = 0;
    let maxRecovery = 0;
    let currentDdStart = -1;

    const chart = sorted.map((s, i) => {
      if (s.total_value > peak) {
        if (currentDdStart >= 0) {
          maxRecovery = Math.max(maxRecovery, i - currentDdStart);
          currentDdStart = -1;
        }
        peak = s.total_value;
      }
      const dd = peak > 0 ? ((s.total_value - peak) / peak) * 100 : 0;
      if (dd < maxDd) {
        maxDd = dd;
        ddStart = i;
      }
      if (dd < 0 && currentDdStart < 0) currentDdStart = i;
      return { date: s.snapshot_date, drawdown: dd };
    });

    const last = chart[chart.length - 1];
    return {
      chart,
      maxDrawdown: maxDd,
      currentDrawdown: last?.drawdown || 0,
      recoveryDays: maxRecovery,
    };
  }, [snapshots]);

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Carregando...</div>;
  }

  if (!snapshots?.length || data.chart.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <TrendingDown className="h-8 w-8 opacity-30" />
        <span>Dados insuficientes para análise de drawdown</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-loss/5 border border-loss/10 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Máx Drawdown</p>
          <p className="text-sm font-bold font-mono text-loss">{formatPercent(data.maxDrawdown)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Drawdown Atual</p>
          <p className={`text-sm font-bold font-mono ${data.currentDrawdown < 0 ? 'text-loss' : 'text-gain'}`}>
            {formatPercent(data.currentDrawdown)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 border border-border p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Recuperação</p>
          <p className="text-sm font-bold font-mono">{data.recoveryDays}d</p>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.chart}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={['auto', 0]} />
            <Tooltip
              formatter={(v: number) => [formatPercent(v), 'Drawdown']}
              labelFormatter={(l) => new Date(l).toLocaleDateString('pt-BR')}
              contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="drawdown" stroke="hsl(var(--loss))" strokeWidth={1.5} dot={false} fill="hsl(var(--loss))" fillOpacity={0.1} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

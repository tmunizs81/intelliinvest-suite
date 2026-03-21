import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '@/lib/mockData';
import { type SnapshotRow } from '@/hooks/usePortfolioSnapshots';
import { type Asset } from '@/lib/mockData';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';

const periods = [
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1A', days: 365 },
];

interface Props {
  assets: Asset[];
  snapshots: SnapshotRow[];
  loading?: boolean;
}

export default function PortfolioChart({ assets, snapshots, loading }: Props) {
  const [activePeriod, setActivePeriod] = useState(4);

  const data = useMemo(() => {
    // Use real snapshots if available
    if (snapshots.length > 0) {
      const days = periods[activePeriod].days;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      return snapshots
        .filter(s => s.snapshot_date >= cutoffStr)
        .map(s => ({ date: s.snapshot_date, value: s.total_value }));
    }

    // Fallback: generate a single point from current assets
    if (assets.length > 0) {
      const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
      const today = new Date().toISOString().split('T')[0];
      return [{ date: today, value: total }];
    }

    return [];
  }, [snapshots, assets, activePeriod]);

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const isPositive = last >= first;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 animate-fade-in flex items-center justify-center h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Evolução Patrimonial</h2>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {periods.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setActivePeriod(i)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  i === activePeriod
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <TrendingUp className="h-10 w-10" />
          <p className="text-sm text-center">
            O gráfico será construído automaticamente a cada login.
            <br />
            <span className="text-xs">Volte amanhã para ver a evolução!</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-gain" />
            ) : (
              <TrendingDown className="h-4 w-4 text-loss" />
            )}
            <h2 className="text-lg font-semibold">Evolução Patrimonial</h2>
          </div>
          <p className={`text-sm font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {formatCurrency(last - first)} ({first > 0 ? ((last - first) / first * 100).toFixed(2) : '0.00'}%)
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {periods.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setActivePeriod(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                i === activePeriod
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? 'hsl(160,84%,39%)' : 'hsl(0,72%,51%)'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? 'hsl(160,84%,39%)' : 'hsl(0,72%,51%)'} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()}
              stroke="hsl(215,12%,50%)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={50}
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
              formatter={(value: number) => [formatCurrency(value), 'Patrimônio']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? 'hsl(160,84%,39%)' : 'hsl(0,72%,51%)'}
              strokeWidth={2}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

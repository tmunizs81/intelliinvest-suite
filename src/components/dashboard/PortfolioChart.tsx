import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { mockPortfolioHistory, formatCurrency } from '@/lib/mockData';

const periods = [
  { label: '7D', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1A', days: 365 },
];

export default function PortfolioChart() {
  const [activePeriod, setActivePeriod] = useState(4);
  const data = mockPortfolioHistory.slice(-periods[activePeriod].days);
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const isPositive = last >= first;

  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Evolução Patrimonial</h2>
          <p className={`text-sm font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
            {formatCurrency(last - first)} ({((last - first) / first * 100).toFixed(2)}%)
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
                const d = new Date(v);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              stroke="hsl(215,12%,50%)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
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
              labelFormatter={(v) => new Date(v).toLocaleDateString('pt-BR')}
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

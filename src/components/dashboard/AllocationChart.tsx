import { memo, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { type Asset } from '@/lib/mockData';

const COLORS = [
  'hsl(160,84%,39%)',
  'hsl(270,70%,60%)',
  'hsl(38,92%,50%)',
  'hsl(200,80%,50%)',
  'hsl(340,65%,50%)',
  'hsl(120,50%,45%)',
  'hsl(30,90%,55%)',
  'hsl(180,60%,45%)',
  'hsl(220,60%,55%)',
  'hsl(0,60%,50%)',
];

interface Props {
  assets: Asset[];
}

export default memo(function AllocationChart({ assets }: Props) {
  const chartData = useMemo(() => {
    const sectorData = assets.reduce<Record<string, number>>((acc, a) => {
      const sector = a.sector || 'Outros';
      acc[sector] = (acc[sector] || 0) + a.allocation;
      return acc;
    }, {});

    return Object.entries(sectorData)
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-fade-in">
      <h2 className="text-lg font-semibold mb-1">Alocação por Setor</h2>
      <p className="text-sm text-muted-foreground mb-4">Distribuição da carteira</p>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(220,18%,9%)',
                border: '1px solid hsl(220,14%,16%)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`${value}%`, 'Alocação']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 mt-2">
        {chartData.map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-mono font-medium">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
});

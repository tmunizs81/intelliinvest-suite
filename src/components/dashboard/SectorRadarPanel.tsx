import { type Asset } from '@/lib/mockData';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity } from 'lucide-react';

export default function SectorRadarPanel({ assets }: { assets: Asset[] }) {
  const sectorMap: Record<string, number> = {};
  const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);

  assets.forEach(a => {
    const sector = a.sector || a.type || 'Outros';
    sectorMap[sector] = (sectorMap[sector] || 0) + a.currentPrice * a.quantity;
  });

  const data = Object.entries(sectorMap)
    .map(([sector, value]) => ({
      sector: sector.length > 12 ? sector.slice(0, 12) + '…' : sector,
      value: totalValue > 0 ? +((value / totalValue) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (data.length < 3) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Adicione ativos de pelo menos 3 setores</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="sector" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [`${v}%`, 'Alocação']}
          />
          <Radar
            dataKey="value"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {data.map(d => (
          <span key={d.sector} className="text-[9px] bg-muted/50 border border-border rounded-full px-2 py-0.5">
            {d.sector}: <span className="font-mono font-bold">{d.value}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import { useMemo } from 'react';

interface Props {
  assets: Asset[];
}

export default function TreemapPanel({ assets }: Props) {
  const data = useMemo(() => {
    const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    return assets
      .map(a => ({
        ticker: a.ticker,
        value: a.currentPrice * a.quantity,
        pct: total > 0 ? ((a.currentPrice * a.quantity) / total) * 100 : 0,
        change: a.change24h,
        type: a.type,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  if (assets.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Adicione ativos para visualizar o treemap
      </div>
    );
  }

  const getColor = (change: number) => {
    if (change > 3) return 'bg-gain/80 text-gain-foreground';
    if (change > 0) return 'bg-gain/40 text-foreground';
    if (change === 0) return 'bg-muted text-foreground';
    if (change > -3) return 'bg-loss/40 text-foreground';
    return 'bg-loss/80 text-loss-foreground';
  };

  const maxVal = Math.max(...data.map(d => d.value));

  return (
    <div className="p-3">
      <div className="flex flex-wrap gap-1.5">
        {data.map((item) => {
          const sizeFactor = Math.max(0.3, item.value / maxVal);
          const minW = Math.max(60, sizeFactor * 160);
          const minH = Math.max(50, sizeFactor * 80);
          return (
            <div
              key={item.ticker}
              className={`rounded-lg p-2 flex flex-col justify-between transition-all hover:scale-[1.02] cursor-default ${getColor(item.change)}`}
              style={{ minWidth: `${minW}px`, minHeight: `${minH}px`, flex: `${item.pct} 1 0%` }}
              title={`${item.ticker} • ${formatCurrency(item.value)} • ${formatPercent(item.change)}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono">{item.ticker}</span>
                <span className="text-[9px] opacity-70">{item.type}</span>
              </div>
              <div>
                <p className="text-[10px] font-mono">{formatCurrency(item.value)}</p>
                <p className="text-[10px] font-mono font-bold">{formatPercent(item.change)}</p>
              </div>
              <div className="text-[9px] opacity-60">{item.pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground justify-center">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-loss/80" /> &lt;-3%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-loss/40" /> -3~0%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted" /> 0%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gain/40" /> 0~3%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gain/80" /> &gt;3%</span>
      </div>
    </div>
  );
}

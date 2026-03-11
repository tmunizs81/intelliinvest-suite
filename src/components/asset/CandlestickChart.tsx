import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Cell,
  ReferenceLine,
} from 'recharts';
import { type Candle, calculateSMA, calculateEMA, calculateBollingerBands } from '@/lib/technicalIndicators';
import { formatCurrency } from '@/lib/mockData';

interface Props {
  candles: Candle[];
}

export default function CandlestickChart({ candles }: Props) {
  const chartData = useMemo(() => {
    if (candles.length === 0) return [];

    const sma20 = calculateSMA(candles, 20);
    const ema9 = calculateEMA(candles, 9);
    const bb = calculateBollingerBands(candles);

    return candles.map((c, i) => ({
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      // For candlestick rendering: body is open-to-close, wick is low-to-high
      bodyLow: Math.min(c.open, c.close),
      bodyHigh: Math.max(c.open, c.close),
      isUp: c.close >= c.open,
      sma20: sma20[i],
      ema9: ema9[i],
      bbUpper: bb[i].upper,
      bbMiddle: bb[i].middle,
      bbLower: bb[i].lower,
    }));
  }, [candles]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  const prices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...prices) * 0.995;
  const maxPrice = Math.max(...prices) * 1.005;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-xl">
        <p className="font-medium mb-1">{d.date}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
          <span className="text-muted-foreground">Abertura:</span>
          <span>{formatCurrency(d.open)}</span>
          <span className="text-muted-foreground">Máxima:</span>
          <span>{formatCurrency(d.high)}</span>
          <span className="text-muted-foreground">Mínima:</span>
          <span>{formatCurrency(d.low)}</span>
          <span className="text-muted-foreground">Fechamento:</span>
          <span className={d.isUp ? 'text-gain' : 'text-loss'}>{formatCurrency(d.close)}</span>
          <span className="text-muted-foreground">Volume:</span>
          <span>{(d.volume / 1e6).toFixed(1)}M</span>
        </div>
      </div>
    );
  };

  // Show fewer ticks for readability
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold">Gráfico de Preços</h2>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
            EMA 9
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: 'hsl(210, 80%, 60%)' }} />
            SMA 20
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded border border-dashed" style={{ borderColor: 'hsl(270, 70%, 60%)' }} />
            Bollinger
          </span>
        </div>
      </div>

      <div className="p-2" style={{ height: 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(220, 14%, 16%)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'hsl(215, 12%, 50%)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
              tickFormatter={(v) => {
                const parts = v.split('-');
                return `${parts[2]}/${parts[1]}`;
              }}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: 'hsl(215, 12%, 50%)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={70}
              tickFormatter={(v) => `R$${v.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Bollinger Bands */}
            <Line type="monotone" dataKey="bbUpper" stroke="hsl(270, 70%, 60%)" strokeWidth={1} dot={false} strokeDasharray="4 4" opacity={0.5} />
            <Line type="monotone" dataKey="bbLower" stroke="hsl(270, 70%, 60%)" strokeWidth={1} dot={false} strokeDasharray="4 4" opacity={0.5} />

            {/* Wicks (high-low) as thin bars */}
            <Bar dataKey="high" barSize={1} fill="transparent" stackId="wick" />

            {/* Candle bodies */}
            <Bar dataKey="bodyHigh" barSize={6} stackId="body" radius={0}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.isUp ? 'hsl(160, 84%, 39%)' : 'hsl(0, 72%, 51%)'}
                  stroke={entry.isUp ? 'hsl(160, 84%, 39%)' : 'hsl(0, 72%, 51%)'}
                />
              ))}
            </Bar>

            {/* Moving Averages */}
            <Line type="monotone" dataKey="ema9" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="sma20" stroke="hsl(210, 80%, 60%)" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

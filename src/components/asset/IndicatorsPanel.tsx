import { useMemo } from 'react';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';
import { formatCurrency } from '@/lib/mockData';

interface Props {
  candles: Candle[];
}

function IndicatorRow({ label, value, signal }: { label: string; value: string; signal?: 'bullish' | 'bearish' | 'neutral' }) {
  const signalColor = signal === 'bullish' ? 'text-gain' : signal === 'bearish' ? 'text-loss' : 'text-muted-foreground';
  const signalBg = signal === 'bullish' ? 'bg-gain/10' : signal === 'bearish' ? 'bg-loss/10' : 'bg-muted';
  const signalText = signal === 'bullish' ? 'Alta' : signal === 'bearish' ? 'Baixa' : 'Neutro';

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-medium">{value}</span>
        {signal && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${signalColor} ${signalBg}`}>
            {signalText}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IndicatorsPanel({ candles }: Props) {
  const indicators = useMemo(() => {
    if (candles.length < 2) return null;
    return getLatestIndicators(candles);
  }, [candles]);

  if (!indicators) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Dados insuficientes para indicadores
      </div>
    );
  }

  const price = indicators.currentPrice;
  const rsiSignal = indicators.rsi !== null
    ? indicators.rsi > 70 ? 'bearish' : indicators.rsi < 30 ? 'bullish' : 'neutral'
    : 'neutral';

  const macdSignal = indicators.macd.histogram !== null
    ? indicators.macd.histogram > 0 ? 'bullish' : 'bearish'
    : 'neutral';

  const sma20Signal = indicators.sma20 !== null
    ? price > indicators.sma20 ? 'bullish' : 'bearish'
    : 'neutral';

  const sma50Signal = indicators.sma50 !== null
    ? price > indicators.sma50 ? 'bullish' : 'bearish'
    : 'neutral';

  const ema9Signal = indicators.ema9 !== null
    ? price > indicators.ema9 ? 'bullish' : 'bearish'
    : 'neutral';

  const volumeSignal = indicators.volume > indicators.avgVolume * 1.3
    ? 'bullish'
    : indicators.volume < indicators.avgVolume * 0.7
      ? 'bearish' : 'neutral';

  // Count signals
  const signals = [rsiSignal, macdSignal, sma20Signal, sma50Signal, ema9Signal].filter(s => s !== 'neutral');
  const bullish = signals.filter(s => s === 'bullish').length;
  const bearish = signals.filter(s => s === 'bearish').length;
  const overallSignal = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';
  const overallLabel = overallSignal === 'bullish' ? 'Majoritariamente Alta' : overallSignal === 'bearish' ? 'Majoritariamente Baixa' : 'Neutro';
  const overallColor = overallSignal === 'bullish' ? 'text-gain' : overallSignal === 'bearish' ? 'text-loss' : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold">Indicadores Técnicos</h2>
        <p className={`text-xs font-medium mt-1 ${overallColor}`}>
          {overallLabel} ({bullish} alta / {bearish} baixa)
        </p>
      </div>

      <div className="p-4 space-y-0">
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Médias Móveis</h3>
        <IndicatorRow
          label="EMA 9"
          value={indicators.ema9 !== null ? formatCurrency(indicators.ema9) : '—'}
          signal={ema9Signal as any}
        />
        <IndicatorRow
          label="SMA 20"
          value={indicators.sma20 !== null ? formatCurrency(indicators.sma20) : '—'}
          signal={sma20Signal as any}
        />
        <IndicatorRow
          label="SMA 50"
          value={indicators.sma50 !== null ? formatCurrency(indicators.sma50) : '—'}
          signal={sma50Signal as any}
        />

        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 mt-4">Osciladores</h3>
        <IndicatorRow
          label="RSI (14)"
          value={indicators.rsi !== null ? indicators.rsi.toFixed(1) : '—'}
          signal={rsiSignal as any}
        />
        <IndicatorRow
          label="MACD"
          value={indicators.macd.macd !== null ? indicators.macd.macd.toFixed(2) : '—'}
          signal={macdSignal as any}
        />
        <IndicatorRow
          label="MACD Signal"
          value={indicators.macd.signal !== null ? indicators.macd.signal.toFixed(2) : '—'}
        />
        <IndicatorRow
          label="Histograma"
          value={indicators.macd.histogram !== null ? indicators.macd.histogram.toFixed(2) : '—'}
          signal={macdSignal as any}
        />

        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 mt-4">Bandas de Bollinger</h3>
        <IndicatorRow
          label="Superior"
          value={indicators.bollingerBands.upper !== null ? formatCurrency(indicators.bollingerBands.upper) : '—'}
        />
        <IndicatorRow
          label="Inferior"
          value={indicators.bollingerBands.lower !== null ? formatCurrency(indicators.bollingerBands.lower) : '—'}
        />

        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 mt-4">Volume</h3>
        <IndicatorRow
          label="Volume Atual"
          value={`${(indicators.volume / 1e6).toFixed(1)}M`}
          signal={volumeSignal as any}
        />
        <IndicatorRow
          label="Volume Médio (20d)"
          value={`${(indicators.avgVolume / 1e6).toFixed(1)}M`}
        />
      </div>
    </div>
  );
}

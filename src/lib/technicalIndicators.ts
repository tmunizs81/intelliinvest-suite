export interface Candle {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calculateSMA(candles: Candle[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    return slice.reduce((s, c) => s + c.close, 0) / period;
  });
}

export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  // First EMA = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  result[period - 1] = sum / period;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    result[i] = (candles[i].close - (result[i - 1] as number)) * multiplier + (result[i - 1] as number);
  }
  return result;
}

export function calculateRSI(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return result;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export interface MACDResult {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export function calculateMACD(candles: Candle[]): MACDResult[] {
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  
  const macdLine: (number | null)[] = candles.map((_, i) => {
    if (ema12[i] === null || ema26[i] === null) return null;
    return (ema12[i] as number) - (ema26[i] as number);
  });

  // Signal line = 9-period EMA of MACD
  const validMacd = macdLine.filter(v => v !== null) as number[];
  const signalPeriod = 9;
  const signalLine: (number | null)[] = new Array(candles.length).fill(null);

  if (validMacd.length >= signalPeriod) {
    const firstValidIdx = macdLine.findIndex(v => v !== null);
    let sum = 0;
    for (let i = 0; i < signalPeriod; i++) sum += validMacd[i];
    signalLine[firstValidIdx + signalPeriod - 1] = sum / signalPeriod;

    const mult = 2 / (signalPeriod + 1);
    for (let i = firstValidIdx + signalPeriod; i < candles.length; i++) {
      if (macdLine[i] === null || signalLine[i - 1] === null) continue;
      signalLine[i] = ((macdLine[i] as number) - (signalLine[i - 1] as number)) * mult + (signalLine[i - 1] as number);
    }
  }

  return candles.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: macdLine[i] !== null && signalLine[i] !== null
      ? (macdLine[i] as number) - (signalLine[i] as number) : null,
  }));
}

export function calculateBollingerBands(candles: Candle[], period = 20, stdDev = 2) {
  const sma = calculateSMA(candles, period);
  return candles.map((_, i) => {
    if (sma[i] === null) return { upper: null, middle: null, lower: null };
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = sma[i] as number;
    const variance = slice.reduce((s, c) => s + Math.pow(c.close - mean, 2), 0) / period;
    const sd = Math.sqrt(variance) * stdDev;
    return { upper: mean + sd, middle: mean, lower: mean - sd };
  });
}

export function getLatestIndicators(candles: Candle[]) {
  const sma20 = calculateSMA(candles, 20);
  const sma50 = calculateSMA(candles, 50);
  const ema9 = calculateEMA(candles, 9);
  const rsi = calculateRSI(candles);
  const macd = calculateMACD(candles);
  const bb = calculateBollingerBands(candles);
  const last = candles.length - 1;

  return {
    sma20: sma20[last],
    sma50: sma50[last],
    ema9: ema9[last],
    rsi: rsi[last],
    macd: macd[last],
    bollingerBands: bb[last],
    currentPrice: candles[last]?.close,
    volume: candles[last]?.volume,
    avgVolume: candles.slice(-20).reduce((s, c) => s + c.volume, 0) / Math.min(20, candles.length),
  };
}

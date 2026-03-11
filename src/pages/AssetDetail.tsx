import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Loader2, Brain, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import {
  type Candle,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  getLatestIndicators,
} from '@/lib/technicalIndicators';
import CandlestickChart from '@/components/asset/CandlestickChart';
import IndicatorsPanel from '@/components/asset/IndicatorsPanel';
import AIAnalysisPanel from '@/components/asset/AIAnalysisPanel';

type RangeOption = '1mo' | '3mo' | '6mo' | '1y' | '2y';

export default function AssetDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { assets, holdings } = usePortfolio();

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>('6mo');
  const [assetName, setAssetName] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [previousClose, setPreviousClose] = useState(0);

  const asset = assets.find(a => a.ticker === ticker);
  const holding = holdings.find(h => h.ticker === ticker);

  const fetchHistory = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('yahoo-finance-history', {
        body: { ticker, range, interval: range === '1mo' ? '1h' : '1d' },
      });

      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);

      setCandles(data.candles || []);
      setAssetName(data.name || ticker);
      setCurrentPrice(data.currentPrice || 0);
      setPreviousClose(data.previousClose || 0);
    } catch (err) {
      console.error('History fetch error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar histórico');
    } finally {
      setLoading(false);
    }
  }, [ticker, range]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const change = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
  const isPositive = change >= 0;

  const profitInfo = asset ? (() => {
    const total = asset.currentPrice * asset.quantity;
    const cost = asset.avgPrice * asset.quantity;
    const profit = total - cost;
    const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
    return { profit, profitPct, total, cost };
  })() : null;

  const ranges: { value: RangeOption; label: string }[] = [
    { value: '1mo', label: '1M' },
    { value: '3mo', label: '3M' },
    { value: '6mo', label: '6M' },
    { value: '1y', label: '1A' },
    { value: '2y', label: '2A' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/')}
            className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{ticker}</h1>
              {asset && (
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary/10 text-primary">
                  {asset.type}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{assetName || asset?.name}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-2xl font-bold font-mono">
                {currentPrice > 0 ? formatCurrency(currentPrice) : '—'}
              </span>
              {currentPrice > 0 && (
                <span className={`inline-flex items-center gap-1 text-sm font-mono font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                  {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {formatPercent(change)}
                </span>
              )}
            </div>
            {profitInfo && (
              <p className={`text-sm font-mono ${profitInfo.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                Lucro: {formatCurrency(profitInfo.profit)} ({formatPercent(profitInfo.profitPct)})
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-loss/30 bg-loss/5 p-4 text-sm text-loss-foreground">
            ⚠️ {error}
          </div>
        )}

        {/* Range selector */}
        <div className="flex items-center gap-2 mb-4">
          {ranges.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                range === r.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="ml-auto h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading && candles.length === 0 ? (
          <div className="flex items-center justify-center py-32 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Carregando dados históricos...</span>
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            {/* Candlestick Chart */}
            <CandlestickChart candles={candles} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Technical Indicators */}
              <div className="lg:col-span-1">
                <IndicatorsPanel candles={candles} />
              </div>

              {/* AI Analysis */}
              <div className="lg:col-span-2">
                <AIAnalysisPanel
                  ticker={ticker || ''}
                  name={assetName || asset?.name || ''}
                  type={asset?.type || 'Ação'}
                  candles={candles}
                  holdingInfo={asset ? {
                    quantity: asset.quantity,
                    avgPrice: asset.avgPrice,
                    currentPrice: asset.currentPrice,
                    profitPct: profitInfo?.profitPct || 0,
                  } : undefined}
                />
              </div>
            </div>

            {/* Holding info card */}
            {asset && profitInfo && (
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">Sua Posição</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantidade</p>
                    <p className="text-lg font-mono font-semibold">{asset.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Preço Médio</p>
                    <p className="text-lg font-mono font-semibold">{formatCurrency(asset.avgPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-mono font-semibold">{formatCurrency(profitInfo.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Alocação</p>
                    <p className="text-lg font-mono font-semibold">{asset.allocation}%</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

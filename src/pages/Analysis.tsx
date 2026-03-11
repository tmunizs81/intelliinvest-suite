import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { Search, Loader2, RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';
import TradingViewWidget from '@/components/analysis/TradingViewWidget';
import CandlestickChart from '@/components/asset/CandlestickChart';
import IndicatorsPanel from '@/components/asset/IndicatorsPanel';
import AIAnalysisPanel from '@/components/asset/AIAnalysisPanel';
import FundamentalIndicators from '@/components/analysis/FundamentalIndicators';
import AISignalBadge from '@/components/analysis/AISignalBadge';
import AIChartSummary from '@/components/analysis/AIChartSummary';
import AssetProfilePanel from '@/components/analysis/AssetProfilePanel';

type RangeOption = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | '10y' | 'max';

export default function Analysis() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams<{ ticker?: string }>();
  const initialTicker = params.ticker || searchParams.get('ticker') || '';
  const { assets, holdings } = usePortfolio();

  const [ticker, setTicker] = useState(initialTicker);
  const [searchInput, setSearchInput] = useState(initialTicker);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>('1y');
  const [assetName, setAssetName] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [previousClose, setPreviousClose] = useState(0);
  const [activeTab, setActiveTab] = useState<'tradingview' | 'custom'>('tradingview');

  const asset = assets.find(a => a.ticker === ticker);

  const fetchHistory = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);

    try {
      const interval = range === '1mo' ? '1h' : range === '5y' || range === '10y' || range === 'max' ? '1wk' : '1d';
      const { data, error: fnError } = await supabase.functions.invoke('yahoo-finance-history', {
        body: { ticker, range, interval },
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
    if (ticker) fetchHistory();
  }, [fetchHistory, ticker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = searchInput.toUpperCase().trim();
    if (!t) return;
    setTicker(t);
    setSearchParams({ ticker: t });
  };

  const handleQuickSelect = (t: string) => {
    setSearchInput(t);
    setTicker(t);
    setSearchParams({ ticker: t });
  };

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
    { value: '5y', label: '5A' },
    { value: '10y', label: '10A' },
    { value: 'max', label: 'Máx' },
  ];

  const assetType = asset?.type || (ticker.match(/\d{2}$/) ? 'FII' : 'Ação');

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Análise Avançada</h1>
        <p className="text-sm text-muted-foreground">Gráficos TradingView, indicadores técnicos, fundamentalistas e dados históricos desde 2015</p>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
            placeholder="Digite o ticker (ex: PETR4, HGLG11, IVVB11)"
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>

        {/* Quick access from portfolio */}
        {holdings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {holdings.slice(0, 8).map(h => (
              <button
                key={h.ticker}
                onClick={() => handleQuickSelect(h.ticker)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  ticker === h.ticker
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                }`}
              >
                {h.ticker}
              </button>
            ))}
          </div>
        )}
      </div>

      {!ticker ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <BarChart3 className="h-16 w-16 text-muted-foreground/20" />
          <p className="text-muted-foreground text-center">
            Selecione um ativo da sua carteira ou digite um ticker para analisar
          </p>
        </div>
      ) : (
        <>
          {/* Asset Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 rounded-lg border border-border bg-card p-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold font-mono">{ticker}</h2>
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary/10 text-primary">
                  {assetType}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{assetName || ticker}</p>
            </div>
            <div className="sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
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

          {/* Asset Profile Summary */}
          <div className="mb-4">
            <AssetProfilePanel ticker={ticker} name={assetName || ticker} type={assetType} />
          </div>

          {/* AI Signal Badge */}
          <div className="mb-4">
            <AISignalBadge
              ticker={ticker}
              name={assetName || ticker}
              type={assetType}
              candles={candles}
              holdingInfo={asset ? {
                quantity: asset.quantity,
                avgPrice: asset.avgPrice,
                currentPrice: asset.currentPrice,
                profitPct: profitInfo?.profitPct || 0,
              } : undefined}
            />
          </div>


          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setActiveTab('tradingview')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'tradingview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TrendingUp className="h-3 w-3 inline mr-1.5" />
                TradingView
              </button>
              <button
                onClick={() => setActiveTab('custom')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'custom' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BarChart3 className="h-3 w-3 inline mr-1.5" />
                Customizado
              </button>
            </div>

            {activeTab === 'custom' && (
              <div className="flex items-center gap-1 flex-wrap">
                {ranges.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={`h-7 px-2.5 rounded-md text-xs font-medium transition-all ${
                      range === r.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                <button
                  onClick={fetchHistory}
                  disabled={loading}
                  className="ml-1 h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-[hsl(var(--loss)/0.3)] bg-[hsl(var(--loss)/0.05)] p-4 text-sm text-[hsl(var(--loss-foreground))]">
              ⚠️ {error}
            </div>
          )}

          {/* Chart */}
          {activeTab === 'tradingview' ? (
            <>
              <TradingViewWidget ticker={ticker} type={assetType} />
              <AIChartSummary ticker={ticker} name={assetName || ticker} type={assetType} candles={candles} />
            </>
          ) : loading && candles.length === 0 ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground">Carregando dados históricos...</span>
            </div>
          ) : (
            <>
              <CandlestickChart candles={candles} />
              <AIChartSummary ticker={ticker} name={assetName || ticker} type={assetType} candles={candles} />
            </>
          )}

          {/* Indicators Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div>
              <IndicatorsPanel candles={candles} />
            </div>
            <div>
              <FundamentalIndicators ticker={ticker} type={assetType} />
            </div>
            <div>
              <AIAnalysisPanel
                ticker={ticker}
                name={assetName || ticker}
                type={assetType}
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


          {/* Position info */}
          {asset && profitInfo && (
            <div className="rounded-lg border border-border bg-card p-6 mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">Sua Posição</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
                  <p className="text-xs text-muted-foreground">Lucro/Prejuízo</p>
                  <p className={`text-lg font-mono font-semibold ${profitInfo.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {formatCurrency(profitInfo.profit)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Alocação</p>
                  <p className="text-lg font-mono font-semibold">{asset.allocation}%</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

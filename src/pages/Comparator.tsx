import { useState, useCallback } from 'react';
import { Search, Loader2, Plus, X, Brain, TrendingUp, TrendingDown, Minus, BarChart3, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import { type Candle, getLatestIndicators } from '@/lib/technicalIndicators';

interface AssetComparison {
  ticker: string;
  name: string;
  type: string;
  currentPrice: number;
  change24h: number;
  candles: Candle[];
  indicators: ReturnType<typeof getLatestIndicators> | null;
  aiSignal: {
    trend: string;
    recommendation: string;
    confidence: number;
    summary: string;
    targetPrice?: number;
    stopLoss?: number;
  } | null;
  fundamentals: Record<string, any> | null;
  dividendYield: number | null;
  loading: boolean;
}

const recConfig: Record<string, { label: string; emoji: string; color: string }> = {
  compra_forte: { label: 'COMPRA FORTE', emoji: '🟢🟢', color: 'text-gain' },
  compra: { label: 'COMPRA', emoji: '🟢', color: 'text-gain' },
  manter: { label: 'MANTER', emoji: '🟡', color: 'text-warning-foreground' },
  venda: { label: 'VENDA', emoji: '🔴', color: 'text-loss' },
  venda_forte: { label: 'VENDA FORTE', emoji: '🔴🔴', color: 'text-loss' },
};

export default function Comparator() {
  const { holdings } = usePortfolio();
  const [assets, setAssets] = useState<AssetComparison[]>([]);
  const [searchInput, setSearchInput] = useState('');

  const addAsset = useCallback(async (ticker: string) => {
    if (assets.length >= 3 || assets.find(a => a.ticker === ticker)) return;

    const newAsset: AssetComparison = {
      ticker,
      name: ticker,
      type: '',
      currentPrice: 0,
      change24h: 0,
      candles: [],
      indicators: null,
      aiSignal: null,
      fundamentals: null,
      dividendYield: null,
      loading: true,
    };

    setAssets(prev => [...prev, newAsset]);

    try {
      // Fetch history, fundamentals and AI in parallel
      const [histRes, fundRes] = await Promise.all([
        supabase.functions.invoke('yahoo-finance-history', {
          body: { ticker, range: '1y', interval: '1d' },
        }),
        supabase.functions.invoke('yahoo-finance-fundamentals', {
          body: { ticker },
        }),
      ]);

      const histData = histRes.data;
      const fundData = fundRes.data;
      const candles: Candle[] = histData?.candles || [];
      const indicators = candles.length >= 20 ? getLatestIndicators(candles) : null;

      // Get AI signal
      let aiSignal = null;
      if (candles.length >= 20) {
        try {
          const aiRes = await supabase.functions.invoke('ai-asset-analysis', {
            body: {
              ticker,
              name: histData?.name || ticker,
              type: fundData?.type || 'Ação',
              indicators,
              recentCandles: candles.slice(-10).map(c => ({
                date: c.date, open: +c.open.toFixed(2), high: +c.high.toFixed(2),
                low: +c.low.toFixed(2), close: +c.close.toFixed(2), volume: c.volume,
              })),
            },
          });
          if (aiRes.data && !aiRes.data.error) {
            aiSignal = aiRes.data;
          }
        } catch { /* skip AI error */ }
      }

      setAssets(prev => prev.map(a => a.ticker === ticker ? {
        ...a,
        name: histData?.name || ticker,
        type: fundData?.type || (ticker.match(/\d{2}$/) ? 'FII' : 'Ação'),
        currentPrice: histData?.currentPrice || 0,
        change24h: histData?.previousClose > 0
          ? ((histData.currentPrice - histData.previousClose) / histData.previousClose * 100) : 0,
        candles,
        indicators,
        aiSignal,
        fundamentals: fundData || null,
        dividendYield: fundData?.dividendYield || null,
        loading: false,
      } : a));
    } catch (err) {
      console.error('Comparator fetch error:', err);
      setAssets(prev => prev.map(a => a.ticker === ticker ? { ...a, loading: false } : a));
    }
  }, [assets]);

  const removeAsset = (ticker: string) => {
    setAssets(prev => prev.filter(a => a.ticker !== ticker));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = searchInput.toUpperCase().trim();
    if (t) {
      addAsset(t);
      setSearchInput('');
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Comparador de Ativos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Compare até 3 ativos lado a lado com indicadores, sinal IA e dividendos</p>
      </div>

      {/* Search + Quick Select */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
            placeholder="Adicionar ativo (ex: PETR4)"
            disabled={assets.length >= 3}
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </form>
        {holdings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {holdings.slice(0, 10).map(h => (
              <button
                key={h.ticker}
                onClick={() => addAsset(h.ticker)}
                disabled={assets.length >= 3 || !!assets.find(a => a.ticker === h.ticker)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-30"
              >
                <Plus className="h-3 w-3 inline mr-1" />{h.ticker}
              </button>
            ))}
          </div>
        )}
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <BarChart3 className="h-16 w-16 text-muted-foreground/20" />
          <p className="text-muted-foreground text-center">Selecione até 3 ativos para comparar</p>
        </div>
      ) : (
        <div className={`grid gap-6 ${assets.length === 1 ? 'grid-cols-1 max-w-lg' : assets.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-3'}`}>
          {assets.map(asset => (
            <div key={asset.ticker} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold font-mono">{asset.ticker}</h3>
                    {asset.type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{asset.type}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{asset.name}</p>
                </div>
                <button onClick={() => removeAsset(asset.ticker)} className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-loss hover:border-loss/30 transition-all">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {asset.loading ? (
                <div className="p-8 flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Carregando...</span>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold font-mono">{asset.currentPrice > 0 ? formatCurrency(asset.currentPrice) : '—'}</span>
                    <span className={`text-sm font-mono font-medium flex items-center gap-1 ${asset.change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
                      {asset.change24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {formatPercent(asset.change24h)}
                    </span>
                  </div>

                  {/* AI Signal */}
                  {asset.aiSignal && (
                    <div className={`rounded-lg border p-3 ${
                      asset.aiSignal.recommendation.includes('compra') ? 'bg-gain/5 border-gain/20' :
                      asset.aiSignal.recommendation.includes('venda') ? 'bg-loss/5 border-loss/20' :
                      'bg-warning/5 border-warning/20'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5 text-primary" />
                          <span className={`text-xs font-bold ${recConfig[asset.aiSignal.recommendation]?.color || 'text-foreground'}`}>
                            {recConfig[asset.aiSignal.recommendation]?.emoji} {recConfig[asset.aiSignal.recommendation]?.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{asset.aiSignal.confidence}%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{asset.aiSignal.summary}</p>
                      {(asset.aiSignal.targetPrice || asset.aiSignal.stopLoss) && (
                        <div className="flex gap-3 mt-2">
                          {asset.aiSignal.targetPrice && (
                            <span className="text-[10px] text-gain">Alvo: {formatCurrency(asset.aiSignal.targetPrice)}</span>
                          )}
                          {asset.aiSignal.stopLoss && (
                            <span className="text-[10px] text-loss">Stop: {formatCurrency(asset.aiSignal.stopLoss)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Indicators */}
                  {asset.indicators && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] text-muted-foreground uppercase font-semibold">Indicadores Técnicos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[10px] text-muted-foreground">RSI (14)</p>
                          <p className={`text-sm font-mono font-bold ${
                            asset.indicators.rsi > 70 ? 'text-loss' : asset.indicators.rsi < 30 ? 'text-gain' : 'text-foreground'
                          }`}>{asset.indicators.rsi?.toFixed(1)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[10px] text-muted-foreground">MACD</p>
                          <p className={`text-sm font-mono font-bold ${
                            asset.indicators.macd?.histogram > 0 ? 'text-gain' : 'text-loss'
                          }`}>{asset.indicators.macd?.histogram?.toFixed(3)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[10px] text-muted-foreground">SMA 9</p>
                          <p className="text-sm font-mono font-bold">{asset.indicators.sma9?.toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[10px] text-muted-foreground">SMA 20</p>
                          <p className="text-sm font-mono font-bold">{asset.indicators.sma20?.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fundamentals */}
                  {asset.fundamentals && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] text-muted-foreground uppercase font-semibold">Fundamentalista</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {asset.fundamentals.pe != null && (
                          <div className="rounded-lg bg-muted/40 p-2">
                            <p className="text-[10px] text-muted-foreground">P/L</p>
                            <p className="text-sm font-mono font-bold">{Number(asset.fundamentals.pe).toFixed(1)}</p>
                          </div>
                        )}
                        {asset.fundamentals.pb != null && (
                          <div className="rounded-lg bg-muted/40 p-2">
                            <p className="text-[10px] text-muted-foreground">P/VP</p>
                            <p className="text-sm font-mono font-bold">{Number(asset.fundamentals.pb).toFixed(2)}</p>
                          </div>
                        )}
                        {(asset.dividendYield || asset.fundamentals.dividendYield) && (
                          <div className="rounded-lg bg-muted/40 p-2 col-span-2">
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-3 w-3" /> Dividend Yield
                            </p>
                            <p className="text-sm font-mono font-bold text-gain">
                              {formatPercent(asset.dividendYield || asset.fundamentals.dividendYield || 0)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

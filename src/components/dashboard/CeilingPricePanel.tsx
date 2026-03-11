import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { Target, Loader2, RefreshCw, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface CeilingAsset {
  ticker: string;
  current_price: number;
  bazin_ceiling: number;
  graham_ceiling: number;
  is_below_bazin: boolean;
  is_below_graham: boolean;
  verdict: string;
  note: string;
}

interface CeilingData {
  summary: string;
  assets: CeilingAsset[];
}

const verdictConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  'Buy': { color: 'text-gain', icon: CheckCircle },
  'Comprar': { color: 'text-gain', icon: CheckCircle },
  'Hold': { color: 'text-warning', icon: MinusCircle },
  'Manter': { color: 'text-warning', icon: MinusCircle },
  'Expensive': { color: 'text-loss', icon: XCircle },
  'Caro': { color: 'text-loss', icon: XCircle },
};

function getVerdictConfig(verdict: string) {
  const key = Object.keys(verdictConfig).find(k => verdict.toLowerCase().includes(k.toLowerCase()));
  return key ? verdictConfig[key] : { color: 'text-muted-foreground', icon: MinusCircle };
}

export default function CeilingPricePanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<CeilingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('ceiling-price', {
        body: { portfolio },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Target className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Preço Teto</h3>
            <p className="text-[10px] text-muted-foreground">Bazin & Graham</p>
          </div>
        </div>
        <button onClick={generate} disabled={loading || assets.length === 0}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-amber-500 hover:border-amber-500/30 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!data && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-amber-500 transition-all">
            <Target className="h-8 w-8" />
            <span className="text-xs">Clique para calcular</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            <p className="text-xs text-muted-foreground">Calculando preços teto...</p>
          </div>
        )}

        {error && <p className="text-xs text-loss text-center py-4">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/10 rounded-lg p-2">{data.summary}</p>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[9px] uppercase tracking-wider text-muted-foreground font-medium px-1">
              <span>Ativo</span>
              <span className="text-right w-16">Bazin</span>
              <span className="text-right w-16">Graham</span>
              <span className="text-center w-14">Status</span>
            </div>

            {data.assets.map((asset, i) => {
              const cfg = getVerdictConfig(asset.verdict);
              const VerdictIcon = cfg.icon;
              return (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center p-2 rounded-lg bg-muted/30 text-[11px]">
                  <div className="min-w-0">
                    <span className="font-bold font-mono">{asset.ticker}</span>
                    <p className="text-[9px] text-muted-foreground truncate">{asset.note}</p>
                  </div>
                  <span className={`text-right w-16 font-mono ${asset.is_below_bazin ? 'text-gain' : 'text-loss'}`}>
                    {asset.bazin_ceiling > 0 ? formatCurrency(asset.bazin_ceiling) : 'N/A'}
                  </span>
                  <span className={`text-right w-16 font-mono ${asset.is_below_graham ? 'text-gain' : 'text-loss'}`}>
                    {asset.graham_ceiling > 0 ? formatCurrency(asset.graham_ceiling) : 'N/A'}
                  </span>
                  <span className={`text-center w-14 flex items-center justify-center gap-1 ${cfg.color}`}>
                    <VerdictIcon className="h-3 w-3" />
                    <span className="text-[9px]">{asset.verdict}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

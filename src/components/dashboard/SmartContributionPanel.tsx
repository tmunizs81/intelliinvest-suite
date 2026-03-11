import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { PiggyBank, Loader2, Send, ArrowUp } from 'lucide-react';

interface Allocation {
  ticker: string;
  amount: number;
  shares: number;
  percentage: number;
  reason: string;
}

interface ContributionData {
  summary: string;
  total_amount: number;
  allocations: Allocation[];
  rationale: string;
}

export default function SmartContributionPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<ContributionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000');

  const generate = useCallback(async () => {
    const val = parseFloat(amount);
    if (assets.length === 0 || isNaN(val) || val <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice,
        sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('smart-contribution', {
        body: { portfolio, monthlyAmount: val },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets, amount]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <PiggyBank className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Aporte Inteligente</h3>
          <p className="text-[10px] text-muted-foreground">Sugestão de distribuição do aporte</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="1000"
              type="number"
              className="w-full bg-muted rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
              disabled={loading}
            />
          </div>
          <button onClick={generate} disabled={loading || assets.length === 0}
            className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center disabled:opacity-50 hover:bg-primary/20 transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {!data && !loading && !error && (
          <div className="text-center py-6 text-muted-foreground">
            <PiggyBank className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Insira o valor do aporte mensal</p>
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/10 rounded-lg p-2">{data.summary}</p>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Distribuição do Aporte</p>
              {data.allocations.map((alloc, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <ArrowUp className="h-3.5 w-3.5 text-gain shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono">{alloc.ticker}</span>
                      <span className="text-[10px] text-primary font-mono">{formatCurrency(alloc.amount)}</span>
                      <span className="text-[9px] text-muted-foreground">({alloc.percentage.toFixed(0)}%)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{alloc.shares > 0 ? `~${alloc.shares} cotas • ` : ''}{alloc.reason}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2">{data.rationale}</p>
          </div>
        )}
      </div>
    </div>
  );
}

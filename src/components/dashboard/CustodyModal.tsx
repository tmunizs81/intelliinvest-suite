import { useMemo } from 'react';
import { X, Building2, TrendingUp, Package } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';
import type { Asset } from '@/lib/mockData';

interface Props {
  open: boolean;
  onClose: () => void;
  holdings: HoldingRow[];
  assets: Asset[];
}

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-[hsl(270,70%,60%)]/10 text-[hsl(270,70%,85%)]',
  'ETF': 'bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,80%)]',
  'ETF Internacional': 'bg-emerald-500/10 text-emerald-400',
  'Cripto': 'bg-[hsl(160,84%,39%)]/10 text-[hsl(160,84%,80%)]',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
  'BDR': 'bg-chart-5/10 text-chart-5',
  'Stock': 'bg-chart-2/10 text-chart-2',
};

export default function CustodyModal({ open, onClose, holdings, assets }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, { holdings: HoldingRow[]; totalValue: number; totalCost: number }> = {};

    for (const h of holdings) {
      const broker = h.broker || 'Sem corretora';
      if (!map[broker]) map[broker] = { holdings: [], totalValue: 0, totalCost: 0 };
      map[broker].holdings.push(h);

      const asset = assets.find(a => a.ticker === h.ticker);
      const price = asset?.currentPrice || h.avg_price;
      map[broker].totalValue += price * h.quantity;
      map[broker].totalCost += h.avg_price * h.quantity;
    }

    return Object.entries(map)
      .sort((a, b) => b[1].totalValue - a[1].totalValue);
  }, [holdings, assets]);

  const grandTotal = grouped.reduce((s, [, g]) => s + g.totalValue, 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Custódia por Corretora</h2>
              <p className="text-xs text-muted-foreground">
                {grouped.length} corretora{grouped.length !== 1 ? 's' : ''} • {holdings.length} ativos
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {grouped.map(([broker, group]) => {
            const profit = group.totalValue - group.totalCost;
            const profitPct = group.totalCost > 0 ? (profit / group.totalCost) * 100 : 0;
            const allocationPct = grandTotal > 0 ? (group.totalValue / grandTotal) * 100 : 0;

            return (
              <div key={broker} className="rounded-lg border border-border bg-background overflow-hidden">
                {/* Broker header */}
                <div className="p-4 border-b border-border/50 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{broker}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {group.holdings.length} ativo{group.holdings.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold">{formatCurrency(group.totalValue)}</p>
                      <div className="flex items-center gap-2 justify-end">
                        <span className={`text-xs font-mono ${profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {profit >= 0 ? '+' : ''}{formatCurrency(profit)} ({formatPercent(profitPct)})
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {allocationPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Allocation bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${allocationPct}%` }}
                    />
                  </div>
                </div>

                {/* Assets list */}
                <div className="divide-y divide-border/30">
                  {group.holdings
                    .sort((a, b) => {
                      const assetA = assets.find(x => x.ticker === a.ticker);
                      const assetB = assets.find(x => x.ticker === b.ticker);
                      const valA = (assetA?.currentPrice || a.avg_price) * a.quantity;
                      const valB = (assetB?.currentPrice || b.avg_price) * b.quantity;
                      return valB - valA;
                    })
                    .map(h => {
                      const asset = assets.find(a => a.ticker === h.ticker);
                      const price = asset?.currentPrice || h.avg_price;
                      const val = price * h.quantity;
                      const cost = h.avg_price * h.quantity;
                      const hProfit = val - cost;
                      const hProfitPct = cost > 0 ? (hProfit / cost) * 100 : 0;

                      return (
                        <div key={h.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-sm">{h.ticker}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[h.type] || 'bg-muted text-muted-foreground'}`}>
                                  {h.type}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{h.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground font-mono">{h.quantity} un</span>
                              <span className="text-xs text-muted-foreground font-mono">PM {formatCurrency(h.avg_price)}</span>
                              <span className="font-mono font-medium text-sm">{formatCurrency(val)}</span>
                            </div>
                            <span className={`text-[11px] font-mono ${hProfit >= 0 ? 'text-gain' : 'text-loss'}`}>
                              {hProfit >= 0 ? '+' : ''}{formatCurrency(hProfit)} ({formatPercent(hProfitPct)})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}

          {holdings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum ativo na carteira</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Geral</span>
            <span className="font-mono font-bold text-lg">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

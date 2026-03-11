import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { mockAssets, formatCurrency, formatPercent } from '@/lib/mockData';

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-ai/10 text-ai-foreground',
  'ETF': 'bg-warning/10 text-warning-foreground',
  'Cripto': 'bg-gain/10 text-gain-foreground',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
};

export default function HoldingsTable() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-5 border-b border-border">
        <h2 className="text-lg font-semibold">Carteira de Ativos</h2>
        <p className="text-sm text-muted-foreground">{mockAssets.length} ativos monitorados</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left p-4 font-medium">Ativo</th>
              <th className="text-left p-4 font-medium">Tipo</th>
              <th className="text-right p-4 font-medium">Qtd</th>
              <th className="text-right p-4 font-medium">PM</th>
              <th className="text-right p-4 font-medium">Atual</th>
              <th className="text-right p-4 font-medium">Variação 24h</th>
              <th className="text-right p-4 font-medium">Total</th>
              <th className="text-right p-4 font-medium">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {mockAssets.map((asset, i) => {
              const total = asset.currentPrice * asset.quantity;
              const cost = asset.avgPrice * asset.quantity;
              const profit = total - cost;
              const profitPct = (profit / cost) * 100;
              const isPositive = asset.change24h >= 0;
              const isProfitable = profit >= 0;

              return (
                <tr
                  key={asset.ticker}
                  className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <td className="p-4">
                    <div>
                      <span className="font-semibold font-mono">{asset.ticker}</span>
                      <p className="text-xs text-muted-foreground">{asset.name}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                      {asset.type}
                    </span>
                  </td>
                  <td className="text-right p-4 font-mono">{asset.quantity}</td>
                  <td className="text-right p-4 font-mono text-muted-foreground">{formatCurrency(asset.avgPrice)}</td>
                  <td className="text-right p-4 font-mono font-medium">{formatCurrency(asset.currentPrice)}</td>
                  <td className="text-right p-4">
                    <span className={`inline-flex items-center gap-1 font-mono text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
                      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {formatPercent(asset.change24h)}
                    </span>
                  </td>
                  <td className="text-right p-4 font-mono font-medium">{formatCurrency(total)}</td>
                  <td className="text-right p-4">
                    <div className={`font-mono ${isProfitable ? 'text-gain' : 'text-loss'}`}>
                      <span className="font-medium">{formatCurrency(profit)}</span>
                      <p className="text-xs">{formatPercent(profitPct)}</p>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

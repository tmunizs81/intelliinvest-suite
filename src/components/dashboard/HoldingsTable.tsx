import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Loader2, Plus, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-ai/10 text-ai-foreground',
  'ETF': 'bg-warning/10 text-warning-foreground',
  'Cripto': 'bg-gain/10 text-gain-foreground',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
};

interface Props {
  assets: Asset[];
  holdings: HoldingRow[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (holding: HoldingRow) => void;
  onDelete: (id: string) => void;
}

export default function HoldingsTable({ assets, holdings, loading, onAdd, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este ativo da carteira?')) return;
    setDeletingId(id);
    onDelete(id);
    setDeletingId(null);
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Carteira de Ativos</h2>
          <p className="text-sm text-muted-foreground">
            {assets.length} ativos • Brapi + Yahoo Finance
            {loading && <Loader2 className="inline ml-2 h-3 w-3 animate-spin" />}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-slow" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
          <button
            onClick={onAdd}
            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      {assets.length === 0 && !loading ? (
        <div className="p-12 text-center">
          <p className="text-muted-foreground mb-4">Nenhum ativo na carteira</p>
          <button
            onClick={onAdd}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Adicionar primeiro ativo
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-4 font-medium">Ativo</th>
                <th className="text-left p-4 font-medium">Tipo</th>
                <th className="text-right p-4 font-medium">Qtd</th>
                <th className="text-right p-4 font-medium">PM</th>
                <th className="text-right p-4 font-medium">Atual</th>
                <th className="text-right p-4 font-medium">24h</th>
                <th className="text-right p-4 font-medium">Total</th>
                <th className="text-right p-4 font-medium">Lucro</th>
                <th className="text-center p-4 font-medium">Fonte</th>
                <th className="text-right p-4 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const total = asset.currentPrice * asset.quantity;
                const cost = asset.avgPrice * asset.quantity;
                const profit = total - cost;
                const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
                const isPositive = asset.change24h >= 0;
                const isProfitable = profit >= 0;
                const holdingRow = holdings.find(h => h.ticker === asset.ticker);

                return (
                  <tr key={asset.ticker} className="border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate(`/asset/${asset.ticker}`)}>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold font-mono">{asset.ticker}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">{asset.name}</p>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                        {asset.type}
                      </span>
                    </td>
                    <td className="text-right p-4 font-mono">{asset.quantity}</td>
                    <td className="text-right p-4 font-mono text-muted-foreground">{formatCurrency(asset.avgPrice)}</td>
                    <td className="text-right p-4 font-mono font-medium">
                      {asset.currentPrice > 0 ? formatCurrency(asset.currentPrice) : '—'}
                    </td>
                    <td className="text-right p-4">
                      {asset.currentPrice > 0 ? (
                        <span className={`inline-flex items-center gap-1 font-mono text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
                          {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatPercent(asset.change24h)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right p-4 font-mono font-medium">
                      {asset.currentPrice > 0 ? formatCurrency(total) : '—'}
                    </td>
                    <td className="text-right p-4">
                      {asset.currentPrice > 0 ? (
                        <div className={`font-mono ${isProfitable ? 'text-gain' : 'text-loss'}`}>
                          <span className="font-medium">{formatCurrency(profit)}</span>
                          <p className="text-xs">{formatPercent(profitPct)}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="text-center p-4">
                      {asset.source ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          asset.source === 'brapi'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : asset.source === 'yahoo'
                              ? 'bg-violet-500/10 text-violet-400'
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {asset.source === 'brapi' ? 'Brapi' : asset.source === 'yahoo' ? 'Yahoo' : '—'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right p-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {holdingRow && (
                          <>
                            <button
                              onClick={() => onEdit(holdingRow)}
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(holdingRow.id)}
                              disabled={deletingId === holdingRow.id}
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-loss hover:bg-loss/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

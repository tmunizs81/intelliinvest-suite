import { useState, useMemo } from 'react';
import { Calculator, Plus, RotateCcw } from 'lucide-react';
import { type Asset, formatCurrency } from '@/lib/mockData';

interface Props {
  assets: Asset[];
}

export default function AvgPriceCalculator({ assets }: Props) {
  const [selectedTicker, setSelectedTicker] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const selectedAsset = useMemo(() => assets.find(a => a.ticker === selectedTicker), [assets, selectedTicker]);

  const result = useMemo(() => {
    if (!selectedAsset || !newQty || !newPrice) return null;
    const qty = parseFloat(newQty);
    const price = parseFloat(newPrice);
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return null;

    const totalOldCost = selectedAsset.avgPrice * selectedAsset.quantity;
    const totalNewCost = price * qty;
    const totalQty = selectedAsset.quantity + qty;
    const newAvg = (totalOldCost + totalNewCost) / totalQty;
    const variation = ((newAvg - selectedAsset.avgPrice) / selectedAsset.avgPrice) * 100;

    return { newAvg, totalQty, totalCost: totalOldCost + totalNewCost, variation };
  }, [selectedAsset, newQty, newPrice]);

  const reset = () => { setNewQty(''); setNewPrice(''); };

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Ativo</label>
        <select
          value={selectedTicker}
          onChange={e => { setSelectedTicker(e.target.value); reset(); }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Selecione um ativo...</option>
          {assets.map(a => (
            <option key={a.ticker} value={a.ticker}>
              {a.ticker} — {a.quantity} cotas @ {formatCurrency(a.avgPrice)}
            </option>
          ))}
        </select>
      </div>

      {selectedAsset && (
        <>
          <div className="rounded-lg bg-muted/30 p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Qtd Atual</p>
              <p className="text-sm font-bold font-mono">{selectedAsset.quantity}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">PM Atual</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(selectedAsset.avgPrice)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Preço Atual</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(selectedAsset.currentPrice)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Nova Quantidade</label>
              <input
                type="number" min="1" step="1" value={newQty} onChange={e => setNewQty(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="100"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preço por Cota</label>
              <input
                type="number" min="0.01" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="25.50"
              />
            </div>
          </div>

          {result && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 animate-fade-in">
              <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" /> Resultado da Simulação
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">Novo PM</p>
                  <p className="text-sm font-bold font-mono">{formatCurrency(result.newAvg)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Variação PM</p>
                  <p className={`text-sm font-bold font-mono ${result.variation > 0 ? 'text-loss' : 'text-gain'}`}>
                    {result.variation >= 0 ? '+' : ''}{result.variation.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Total Cotas</p>
                  <p className="text-sm font-bold font-mono">{result.totalQty}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Custo Total</p>
                  <p className="text-sm font-bold font-mono">{formatCurrency(result.totalCost)}</p>
                </div>
              </div>
            </div>
          )}

          <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Limpar simulação
          </button>
        </>
      )}
    </div>
  );
}

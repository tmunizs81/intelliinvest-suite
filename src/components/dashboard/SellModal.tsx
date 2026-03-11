import { useState, useEffect } from 'react';
import { X, ArrowDownRight, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';

interface Props {
  open: boolean;
  holding: HoldingRow | null;
  currentPrice: number;
  onClose: () => void;
  onSell: (holdingId: string, qty: number, price: number, fees: number) => Promise<void>;
}

export default function SellModal({ open, holding, currentPrice, onClose, onSell }: Props) {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && holding) {
      setQuantity('');
      setPrice(currentPrice > 0 ? currentPrice.toFixed(2) : '');
      setFees('');
      setError('');
    }
  }, [open, holding, currentPrice]);

  if (!open || !holding) return null;

  const qty = parseFloat(quantity) || 0;
  const prc = parseFloat(price) || 0;
  const fee = parseFloat(fees) || 0;
  const total = qty * prc;
  const net = total - fee;
  const profit = qty * (prc - holding.avg_price);
  const profitPct = holding.avg_price > 0 ? ((prc - holding.avg_price) / holding.avg_price) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (qty <= 0) { setError('Informe a quantidade'); return; }
    if (qty > holding.quantity) { setError(`Quantidade máxima: ${holding.quantity}`); return; }
    if (prc <= 0) { setError('Informe o preço de venda'); return; }

    setLoading(true);
    try {
      await onSell(holding.id, qty, prc, fee);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao registrar venda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--loss)/0.1)] flex items-center justify-center">
              <ArrowDownRight className="h-4 w-4 text-[hsl(var(--loss-foreground))]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Vender {holding.ticker}</h2>
              <p className="text-xs text-muted-foreground">{holding.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
          )}

          {/* Current position info */}
          <div className="rounded-lg bg-muted/50 p-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Posição</p>
              <p className="text-sm font-mono font-bold">{holding.quantity}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">PM</p>
              <p className="text-sm font-mono font-bold">{formatCurrency(holding.avg_price)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Atual</p>
              <p className="text-sm font-mono font-bold">{currentPrice > 0 ? formatCurrency(currentPrice) : '—'}</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Quantidade a vender *</label>
            <div className="relative">
              <input
                type="number" step="any" min="0.00001" max={holding.quantity}
                value={quantity} onChange={e => setQuantity(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-20"
                placeholder="0"
              />
              <button
                type="button"
                onClick={() => setQuantity(holding.quantity.toString())}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors"
              >
                Vender tudo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Preço de venda *</label>
              <input
                type="number" step="0.01" min="0"
                value={price} onChange={e => setPrice(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Taxas / Corretagem</label>
              <input
                type="number" step="0.01" min="0"
                value={fees} onChange={e => setFees(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Summary */}
          {qty > 0 && prc > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total bruto</span>
                <span className="font-mono font-medium">{formatCurrency(total)}</span>
              </div>
              {fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxas</span>
                  <span className="font-mono text-[hsl(var(--loss-foreground))]">-{formatCurrency(fee)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-muted-foreground">Líquido → Caixa</span>
                <span className="font-mono font-bold">{formatCurrency(net)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lucro/Prejuízo</span>
                <span className={`font-mono font-bold ${profit >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                  {profit >= 0 ? '+' : ''}{formatCurrency(profit)} ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                </span>
              </div>
              {qty === holding.quantity && (
                <p className="text-[10px] text-center text-muted-foreground mt-1">⚠️ Venda total — o ativo será removido da carteira</p>
              )}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-[hsl(var(--loss))] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownRight className="h-4 w-4" />}
            Confirmar Venda
          </button>
        </form>
      </div>
    </div>
  );
}

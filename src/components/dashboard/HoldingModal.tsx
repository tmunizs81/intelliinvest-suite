import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import type { HoldingRow } from '@/hooks/usePortfolio';

const TYPES = ['Ação', 'FII', 'ETF', 'Cripto', 'Renda Fixa'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (holding: Omit<HoldingRow, 'id'>) => Promise<void>;
  editData?: HoldingRow | null;
  onUpdate?: (id: string, data: Partial<HoldingRow>) => Promise<void>;
}

export default function HoldingModal({ open, onClose, onSave, editData, onUpdate }: Props) {
  const [ticker, setTicker] = useState(editData?.ticker || '');
  const [name, setName] = useState(editData?.name || '');
  const [type, setType] = useState<string>(editData?.type || 'Ação');
  const [quantity, setQuantity] = useState(editData?.quantity?.toString() || '');
  const [avgPrice, setAvgPrice] = useState(editData?.avg_price?.toString() || '');
  const [sector, setSector] = useState(editData?.sector || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = {
        ticker: ticker.toUpperCase().trim(),
        name: name.trim(),
        type,
        quantity: parseFloat(quantity),
        avg_price: parseFloat(avgPrice),
        sector: sector.trim() || null,
      };

      if (!data.ticker || !data.name || isNaN(data.quantity) || isNaN(data.avg_price)) {
        setError('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }

      if (editData && onUpdate) {
        await onUpdate(editData.id, data);
      } else {
        await onSave(data);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">{editData ? 'Editar Ativo' : 'Adicionar Ativo'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-loss/10 border border-loss/20 p-3 text-sm text-loss-foreground">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ticker *</label>
              <input
                value={ticker} onChange={e => setTicker(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="PETR4"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
              <select
                value={type} onChange={e => setType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nome *</label>
            <input
              value={name} onChange={e => setName(e.target.value)} required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Petrobras PN"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quantidade *</label>
              <input
                type="number" step="any" min="0.00001" value={quantity} onChange={e => setQuantity(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Preço Médio (R$) *</label>
              <input
                type="number" step="0.01" min="0" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="28.50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Setor</label>
            <input
              value={sector} onChange={e => setSector(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Petróleo, Bancos, Cripto..."
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editData ? 'Salvar alterações' : 'Adicionar ativo'}
          </button>
        </form>
      </div>
    </div>
  );
}

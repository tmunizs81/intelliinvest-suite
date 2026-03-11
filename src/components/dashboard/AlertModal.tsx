import { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import type { AlertType } from '@/hooks/useAlerts';

const ALERT_TYPES: { value: AlertType; label: string; description: string }[] = [
  { value: 'price_above', label: 'Preço Acima de', description: 'Quando o preço subir acima do valor' },
  { value: 'price_below', label: 'Preço Abaixo de', description: 'Quando o preço cair abaixo do valor' },
  { value: 'stop_loss', label: 'Stop Loss', description: 'Vender quando cair até o valor' },
  { value: 'take_profit', label: 'Take Profit', description: 'Realizar lucro quando atingir o valor' },
  { value: 'variation_up', label: 'Alta Diária (%)', description: 'Quando a variação do dia subir X%' },
  { value: 'variation_down', label: 'Queda Diária (%)', description: 'Quando a variação do dia cair X%' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (alert: { ticker: string; name: string; alert_type: AlertType; target_value: number; notify_telegram: boolean }) => Promise<void>;
}

export default function AlertModal({ open, onClose, onSave }: Props) {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('price_above');
  const [targetValue, setTargetValue] = useState('');
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const isPercentType = alertType === 'variation_up' || alertType === 'variation_down';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSave({
        ticker: ticker.toUpperCase().trim(),
        name: name.trim() || ticker.toUpperCase().trim(),
        alert_type: alertType,
        target_value: parseFloat(targetValue),
        notify_telegram: notifyTelegram,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar alerta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">Criar Alerta</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-md bg-loss/10 border border-loss/20 p-3 text-sm text-loss-foreground">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ticker *</label>
              <input value={ticker} onChange={e => setTicker(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="PETR4" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Petrobras" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Alerta *</label>
            <select value={alertType} onChange={e => setAlertType(e.target.value as AlertType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              {ALERT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              {ALERT_TYPES.find(t => t.value === alertType)?.description}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {isPercentType ? 'Variação (%)' : 'Preço (R$)'} *
            </label>
            <input type="number" step="0.01" value={targetValue} onChange={e => setTargetValue(e.target.value)} required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={isPercentType ? '5.00' : '45.00'} />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={notifyTelegram} onChange={e => setNotifyTelegram(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary" />
            <span className="text-sm text-foreground">Notificar via Telegram</span>
          </label>

          <button type="submit" disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar alerta
          </button>
        </form>
      </div>
    </div>
  );
}

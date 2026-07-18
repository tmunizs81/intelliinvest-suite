import { useState } from 'react';
import { X, Zap, MessageCircle, Mail, Calendar, Info } from 'lucide-react';
import type { AlertType, ConditionLogic, NewAlertInput } from '@/hooks/useAlerts';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (a: NewAlertInput) => Promise<void>;
  telegramReady?: boolean;
  emailReady?: boolean;
}

const TYPES: { value: AlertType; label: string; hint: string }[] = [
  { value: 'stop_loss',      label: 'Stop-loss (%)',            hint: 'Queda percentual sobre o preço médio' },
  { value: 'take_profit',    label: 'Take-profit (%)',          hint: 'Ganho percentual sobre o preço médio' },
  { value: 'price_above',    label: 'Preço acima de',           hint: 'Cotação sobe até o valor absoluto' },
  { value: 'price_below',    label: 'Preço abaixo de',          hint: 'Cotação cai até o valor absoluto' },
  { value: 'variation_up',   label: 'Variação diária ↑ (%)',    hint: 'Alta percentual no dia' },
  { value: 'variation_down', label: 'Variação diária ↓ (%)',    hint: 'Queda percentual no dia' },
];

export default function AdvancedAlertModal({ open, onClose, onSave, telegramReady, emailReady }: Props) {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [primaryType, setPrimaryType] = useState<AlertType>('stop_loss');
  const [primaryValue, setPrimaryValue] = useState('');
  const [useSecondary, setUseSecondary] = useState(false);
  const [secondaryType, setSecondaryType] = useState<AlertType>('take_profit');
  const [secondaryValue, setSecondaryValue] = useState('');
  const [logic, setLogic] = useState<ConditionLogic>('OR');
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const reset = () => {
    setTicker(''); setName(''); setPrimaryType('stop_loss'); setPrimaryValue('');
    setUseSecondary(false); setSecondaryType('take_profit'); setSecondaryValue('');
    setLogic('OR'); setNotifyTelegram(true); setNotifyEmail(false);
    setValidUntil(''); setNotes(''); setErr('');
  };

  const submit = async () => {
    setErr('');
    if (!ticker.trim() || !primaryValue) { setErr('Ticker e valor primário obrigatórios.'); return; }
    if (useSecondary && !secondaryValue) { setErr('Preencha o valor da condição secundária.'); return; }
    setSaving(true);
    try {
      await onSave({
        ticker: ticker.toUpperCase().trim(),
        name: name.trim() || ticker.toUpperCase().trim(),
        alert_type: primaryType,
        target_value: parseFloat(primaryValue.replace(',', '.')),
        notify_telegram: notifyTelegram,
        notify_email: notifyEmail,
        secondary_type: useSecondary ? secondaryType : null,
        secondary_value: useSecondary ? parseFloat(secondaryValue.replace(',', '.')) : null,
        condition_logic: useSecondary ? logic : 'OR',
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
      });
      reset();
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao salvar alerta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Alerta Avançado</h2>
              <p className="text-[11px] text-muted-foreground">Combine condições e defina validade</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {err && <div className="rounded-md bg-loss/10 border border-loss/20 p-2.5 text-xs text-loss">{err}</div>}

          {/* Asset */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Ticker</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="PETR4"
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Nome (opcional)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Petrobras PN"
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Primary condition */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase text-primary">Condição principal</p>
            <div className="grid grid-cols-[1fr,140px] gap-2">
              <select
                value={primaryType}
                onChange={(e) => setPrimaryType(e.target.value as AlertType)}
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              >
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input
                value={primaryValue}
                onChange={(e) => setPrimaryValue(e.target.value)}
                placeholder="Valor"
                inputMode="decimal"
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono text-right"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{TYPES.find((t) => t.value === primaryType)?.hint}</p>
          </div>

          {/* Secondary condition toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useSecondary}
              onChange={(e) => setUseSecondary(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-medium">Adicionar segunda condição</span>
          </label>

          {useSecondary && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">Lógica:</span>
                {(['OR', 'AND'] as ConditionLogic[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLogic(l)}
                    className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-all ${
                      logic === l ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {l === 'OR' ? 'OU (qualquer)' : 'E (ambas)'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[1fr,140px] gap-2">
                <select
                  value={secondaryType}
                  onChange={(e) => setSecondaryType(e.target.value as AlertType)}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                >
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  placeholder="Valor"
                  inputMode="decimal"
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono text-right"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {logic === 'OR'
                  ? 'Dispara se QUALQUER uma das condições for satisfeita (ideal para stop-loss OU take-profit).'
                  : 'Dispara apenas se AMBAS forem verdadeiras ao mesmo tempo.'}
              </p>
            </div>
          )}

          {/* Notifications */}
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer transition-all ${
              notifyTelegram ? 'border-primary/40 bg-primary/5' : 'border-border'
            } ${!telegramReady ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                checked={notifyTelegram && !!telegramReady}
                disabled={!telegramReady}
                onChange={(e) => setNotifyTelegram(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <MessageCircle className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">Telegram</span>
            </label>
            <label className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer transition-all ${
              notifyEmail ? 'border-primary/40 bg-primary/5' : 'border-border'
            } ${!emailReady ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                checked={notifyEmail && !!emailReady}
                disabled={!emailReady}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <Mail className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">E-mail</span>
            </label>
          </div>
          {(!telegramReady || !emailReady) && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3" />
              Configure os canais em Preferências de Notificação para habilitar.
            </p>
          )}

          {/* Validity */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Validade do gatilho (opcional)
            </label>
            <input
              type="datetime-local"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Após essa data o alerta é pausado automaticamente.</p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex.: Tese de curto prazo, stop apertado por volatilidade"
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent/50">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving}
            className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Criar alerta'}
          </button>
        </div>
      </div>
    </div>
  );
}

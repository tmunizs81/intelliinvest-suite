import { useState, useEffect } from 'react';
import { X, Bell, MessageCircle, Mail, Info } from 'lucide-react';
import type { TelegramSettings, EventKey, EventPrefs } from '@/hooks/useAlerts';
import { DEFAULT_EVENT_PREFS } from '@/hooks/useAlerts';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: TelegramSettings;
  onSave: (s: TelegramSettings) => Promise<void> | void;
}

const EVENTS: { key: EventKey; label: string; desc: string }[] = [
  { key: 'price',        label: 'Preço-alvo atingido',      desc: 'Preço sobe ou cai até o valor definido' },
  { key: 'stop_loss',    label: 'Stop-loss disparado',      desc: 'Perda máxima aceita foi atingida' },
  { key: 'take_profit',  label: 'Take-profit atingido',     desc: 'Lucro-alvo alcançado' },
  { key: 'variation',    label: 'Variação diária',          desc: 'Alta ou queda percentual expressiva no dia' },
  { key: 'dividends',    label: 'Novos proventos',          desc: 'Dividendos, JCP ou rendimentos anunciados' },
  { key: 'daily_summary',label: 'Resumo diário',            desc: 'Consolidado da carteira ao fim do pregão' },
];

export default function NotificationPreferencesModal({ open, onClose, settings, onSave }: Props) {
  const [local, setLocal] = useState<TelegramSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setLocal(settings); }, [open, settings]);

  if (!open) return null;

  const setEvent = (key: EventKey, channel: 'telegram' | 'email', value: boolean) => {
    setLocal((s) => ({
      ...s,
      event_prefs: { ...s.event_prefs, [key]: { ...s.event_prefs[key], [channel]: value } },
    }));
  };

  const resetDefaults = () => setLocal((s) => ({ ...s, event_prefs: DEFAULT_EVENT_PREFS }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(local, botToken.trim() || undefined);
      // O token existe apenas neste estado local e é descartado após salvar.
      setBotToken('');
      onClose();
    } finally { setSaving(false); }
  };

  const telegramReady = local.enabled && (local.has_bot_token || !!botToken.trim()) && !!local.chat_id;
  const emailReady = local.notify_email && !!local.email_address;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Preferências de Notificação</h2>
              <p className="text-[11px] text-muted-foreground">Escolha canais e eventos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Channels */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Canais</h3>

            {/* Telegram */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Telegram</span>
                  {telegramReady && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gain/10 text-gain">Pronto</span>}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={local.enabled}
                    onChange={(e) => setLocal((s) => ({ ...s, enabled: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">Ativar</span>
                </label>
              </div>
              {local.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={local.has_bot_token ? 'Bot Token (já configurado)' : 'Bot Token'}
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono"
                  />
                  <input
                    value={local.chat_id ?? ''}
                    onChange={(e) => setLocal((s) => ({ ...s, chat_id: e.target.value }))}
                    placeholder="Chat ID"
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            {/* Email */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">E-mail</span>
                  {emailReady && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gain/10 text-gain">Pronto</span>}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={local.notify_email}
                    onChange={(e) => setLocal((s) => ({ ...s, notify_email: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground">Ativar</span>
                </label>
              </div>
              {local.notify_email && (
                <input
                  type="email"
                  value={local.email_address ?? ''}
                  onChange={(e) => setLocal((s) => ({ ...s, email_address: e.target.value }))}
                  placeholder="seu@email.com"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                />
              )}
            </div>
          </section>

          {/* Event matrix */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Eventos</h3>
              <button onClick={resetDefaults} className="text-[11px] text-primary hover:underline">
                Restaurar padrões
              </button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr,80px,80px] gap-2 px-3 py-2 bg-muted/40 text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                <span>Evento</span>
                <span className="text-center">Telegram</span>
                <span className="text-center">E-mail</span>
              </div>
              {EVENTS.map(({ key, label, desc }) => {
                const pref = local.event_prefs[key] ?? { telegram: false, email: false };
                return (
                  <div key={key} className="grid grid-cols-[1fr,80px,80px] gap-2 items-center px-3 py-2.5 border-t border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={pref.telegram && local.enabled}
                        disabled={!local.enabled}
                        onChange={(e) => setEvent(key, 'telegram', e.target.checked)}
                        className="h-4 w-4 accent-primary disabled:opacity-30"
                      />
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={pref.email && local.notify_email}
                        disabled={!local.notify_email}
                        onChange={(e) => setEvent(key, 'email', e.target.checked)}
                        className="h-4 w-4 accent-primary disabled:opacity-30"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>Habilite primeiro o canal (Telegram/E-mail) para poder marcar os eventos correspondentes.</span>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
          <button onClick={onClose} className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent/50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar preferências'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import {
  Bell, Plus, Trash2, Pause, Play, RotateCcw, MessageCircle, BellDot,
  Target, TrendingDown, TrendingUp, ArrowUp, ArrowDown, Zap, Shield, Filter,
} from 'lucide-react';
import { useAlerts, type AlertRow, type AlertStatus, type AlertType } from '@/hooks/useAlerts';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import AlertModal from './AlertModal';
import TelegramSettingsModal from './TelegramSettingsModal';
import { formatCurrency } from '@/lib/mockData';

const typeConfig: Record<AlertType, { icon: React.ElementType; label: string; tone: 'gain' | 'loss' | 'warn' | 'info' }> = {
  price_above: { icon: ArrowUp, label: 'Preço acima', tone: 'gain' },
  price_below: { icon: ArrowDown, label: 'Preço abaixo', tone: 'loss' },
  stop_loss:   { icon: Shield, label: 'Stop Loss', tone: 'loss' },
  take_profit: { icon: Target, label: 'Take Profit', tone: 'gain' },
  variation_up:   { icon: TrendingUp, label: 'Alta diária', tone: 'gain' },
  variation_down: { icon: TrendingDown, label: 'Queda diária', tone: 'loss' },
};

const toneClasses = {
  gain: { text: 'text-gain', bg: 'bg-gain/10', ring: 'ring-gain/20' },
  loss: { text: 'text-loss', bg: 'bg-loss/10', ring: 'ring-loss/20' },
  warn: { text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/20' },
  info: { text: 'text-primary', bg: 'bg-primary/10', ring: 'ring-primary/20' },
};

type FilterKey = 'all' | 'active' | 'triggered' | 'paused';

export default function SmartAlertsPanelV2() {
  const { alerts, telegramSettings, addAlert, deleteAlert, toggleAlert, reactivateAlert, saveTelegramSettings } = useAlerts();
  const { supported: pushSupported, permission: pushPermission, requestPermission, sendNotification } = usePushNotifications();
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const seenTriggered = useRef<Set<string>>(new Set());

  // Fire browser notification when an alert transitions to 'triggered'
  useEffect(() => {
    if (pushPermission !== 'granted') return;
    alerts.forEach((a) => {
      if (a.status === 'triggered' && !seenTriggered.current.has(a.id)) {
        seenTriggered.current.add(a.id);
        const cfg = typeConfig[a.alert_type];
        sendNotification(`🔔 ${a.ticker} — ${cfg.label}`, {
          body: `Alvo: ${a.target_value} • Atual: ${a.current_value ?? '—'}`,
          tag: a.id,
        });
      }
    });
  }, [alerts, pushPermission, sendNotification]);

  const counts = {
    all: alerts.length,
    active: alerts.filter((a) => a.status === 'active').length,
    triggered: alerts.filter((a) => a.status === 'triggered').length,
    paused: alerts.filter((a) => a.status === 'paused').length,
  };

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.status === filter);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Alertas Inteligentes</h2>
              <p className="text-[11px] text-muted-foreground">Stop-loss, take-profit e variações</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {pushSupported && (
              <button
                onClick={requestPermission}
                className={`h-8 w-8 rounded-md border flex items-center justify-center transition-all ${
                  pushPermission === 'granted'
                    ? 'border-gain/40 bg-gain/10 text-gain'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                }`}
                title={pushPermission === 'granted' ? 'Notificações ativas' : 'Ativar notificações'}
              >
                <BellDot className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setTelegramModalOpen(true)}
              className={`h-8 w-8 rounded-md border flex items-center justify-center transition-all ${
                telegramSettings.enabled
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
              title="Configurar Telegram"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setAlertModalOpen(true)}
              className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
          {(['all', 'active', 'triggered', 'paused'] as FilterKey[]).map((k) => {
            const labels = { all: 'Todos', active: 'Ativos', triggered: 'Disparados', paused: 'Pausados' };
            const isActive = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`shrink-0 h-6 px-2.5 rounded-full text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {labels[k]} <span className="opacity-70">· {counts[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              {alerts.length === 0 ? 'Nenhum alerta configurado' : 'Nenhum alerta neste filtro'}
            </p>
            {alerts.length === 0 && (
              <button
                onClick={() => setAlertModalOpen(true)}
                className="text-xs text-primary hover:underline mt-2"
              >
                Criar primeiro alerta
              </button>
            )}
          </div>
        ) : (
          filtered.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onToggle={() => toggleAlert(a.id, a.status)}
              onReactivate={() => reactivateAlert(a.id)}
              onDelete={() => deleteAlert(a.id)}
            />
          ))
        )}
      </div>

      <AlertModal open={alertModalOpen} onClose={() => setAlertModalOpen(false)} onSave={addAlert} />
      <TelegramSettingsModal
        open={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
        settings={telegramSettings}
        onSave={saveTelegramSettings}
      />
    </div>
  );
}

function AlertCard({
  alert,
  onToggle,
  onReactivate,
  onDelete,
}: {
  alert: AlertRow;
  onToggle: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const cfg = typeConfig[alert.alert_type];
  const tone = toneClasses[cfg.tone];
  const Icon = cfg.icon;
  const isPercent = alert.alert_type === 'variation_up' || alert.alert_type === 'variation_down';
  const isTriggered = alert.status === 'triggered';
  const isPaused = alert.status === 'paused';

  const target = isPercent ? `${alert.target_value}%` : formatCurrency(alert.target_value);
  const current = alert.current_value != null && alert.current_value > 0
    ? (isPercent ? `${alert.current_value}%` : formatCurrency(alert.current_value))
    : null;

  return (
    <div
      className={`group rounded-lg border p-3 transition-all ${
        isTriggered
          ? 'border-warning/40 bg-warning/5 ring-1 ring-warning/20 animate-pulse-subtle'
          : isPaused
          ? 'border-border/40 bg-muted/20 opacity-70'
          : 'border-border hover:border-primary/30 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-md ${tone.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${tone.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{alert.ticker}</span>
            <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
            {isTriggered && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-semibold uppercase">
                Disparado
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-sm font-medium">{target}</span>
            {current && (
              <span className="text-[11px] text-muted-foreground">
                atual: <span className="font-mono">{current}</span>
              </span>
            )}
          </div>
          {alert.notify_telegram && (
            <div className="flex items-center gap-1 mt-1">
              <MessageCircle className="h-2.5 w-2.5 text-primary" />
              <span className="text-[10px] text-primary/80">Telegram</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
          {isTriggered ? (
            <button
              onClick={onReactivate}
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10"
              title="Reativar"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onToggle}
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              title={isPaused ? 'Ativar' : 'Pausar'}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-loss hover:bg-loss/10"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

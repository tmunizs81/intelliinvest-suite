import { useState } from 'react';
import { Bell, Plus, Trash2, Pause, Play, RotateCcw, MessageCircle, BellRing, Target, TrendingDown, TrendingUp, ArrowUp, ArrowDown, BellDot } from 'lucide-react';
import { useAlerts, type AlertRow, type AlertStatus } from '@/hooks/useAlerts';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import AlertModal from './AlertModal';
import TelegramSettingsModal from './TelegramSettingsModal';
import { formatCurrency } from '@/lib/mockData';

const alertTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  price_above: { icon: ArrowUp, label: 'Preço Acima', color: 'text-gain' },
  price_below: { icon: ArrowDown, label: 'Preço Abaixo', color: 'text-loss' },
  stop_loss: { icon: TrendingDown, label: 'Stop Loss', color: 'text-loss' },
  take_profit: { icon: Target, label: 'Take Profit', color: 'text-gain' },
  variation_up: { icon: TrendingUp, label: 'Alta %', color: 'text-gain' },
  variation_down: { icon: TrendingDown, label: 'Queda %', color: 'text-loss' },
};

const statusConfig: Record<AlertStatus, { label: string; class: string }> = {
  active: { label: 'Ativo', class: 'bg-gain/10 text-gain-foreground' },
  triggered: { label: 'Disparado', class: 'bg-warning/10 text-warning-foreground' },
  paused: { label: 'Pausado', class: 'bg-muted text-muted-foreground' },
};

export default function AlertsPanel() {
  const { alerts, telegramSettings, addAlert, deleteAlert, toggleAlert, reactivateAlert, saveTelegramSettings } = useAlerts();
  const { supported: pushSupported, permission: pushPermission, requestPermission } = usePushNotifications();
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const triggeredCount = alerts.filter(a => a.status === 'triggered').length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <Bell className="h-4 w-4 text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Alertas</h2>
              <p className="text-xs text-muted-foreground">
                {activeCount} ativos • {triggeredCount} disparados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {pushSupported && (
              <button
                onClick={requestPermission}
                className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-all ${
                  pushPermission === 'granted' ? 'border-gain/30 text-gain' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                title={pushPermission === 'granted' ? 'Push ativo' : 'Ativar notificações push'}
              >
                <BellDot className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setTelegramModalOpen(true)}
              className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-all ${
                telegramSettings.enabled ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Configurar Telegram"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setAlertModalOpen(true)}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <BellRing className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">Nenhum alerta configurado</p>
            <button
              onClick={() => setAlertModalOpen(true)}
              className="text-xs text-primary hover:underline"
            >
              Criar primeiro alerta
            </button>
          </div>
        ) : (
          alerts.map((alert) => {
            const config = alertTypeConfig[alert.alert_type] || alertTypeConfig.price_above;
            const status = statusConfig[alert.status];
            const Icon = config.icon;
            const isPercent = alert.alert_type === 'variation_up' || alert.alert_type === 'variation_down';

            return (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 transition-all ${
                  alert.status === 'triggered' ? 'border-warning/30 bg-warning/5' :
                  alert.status === 'paused' ? 'border-border/50 opacity-60' :
                  'border-border hover:border-primary/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono">{alert.ticker}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.class}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {config.label}: {isPercent ? `${alert.target_value}%` : formatCurrency(alert.target_value)}
                      </p>
                      {alert.current_value != null && alert.current_value > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Atual: {isPercent ? `${alert.current_value}%` : formatCurrency(alert.current_value)}
                        </p>
                      )}
                      {alert.notify_telegram && (
                        <div className="flex items-center gap-1 mt-1">
                          <MessageCircle className="h-2.5 w-2.5 text-primary" />
                          <span className="text-[10px] text-primary">Telegram</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {alert.status === 'triggered' ? (
                      <button onClick={() => reactivateAlert(alert.id)}
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10"
                        title="Reativar">
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    ) : (
                      <button onClick={() => toggleAlert(alert.id, alert.status)}
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
                        title={alert.status === 'active' ? 'Pausar' : 'Ativar'}>
                        {alert.status === 'active' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                    )}
                    <button onClick={() => deleteAlert(alert.id)}
                      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-loss hover:bg-loss/10"
                      title="Excluir">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
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

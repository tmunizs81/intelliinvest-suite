import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AlertType = 'price_above' | 'price_below' | 'variation_up' | 'variation_down' | 'stop_loss' | 'take_profit';
export type AlertStatus = 'active' | 'triggered' | 'paused';
export type ConditionLogic = 'OR' | 'AND';

export interface AlertRow {
  id: string;
  ticker: string;
  name: string;
  alert_type: AlertType;
  target_value: number;
  current_value: number | null;
  status: AlertStatus;
  notify_telegram: boolean;
  notify_email: boolean;
  secondary_type: AlertType | null;
  secondary_value: number | null;
  condition_logic: ConditionLogic;
  valid_until: string | null;
  notes: string | null;
  triggered_at: string | null;
  created_at: string;
}

export type EventKey = 'price' | 'stop_loss' | 'take_profit' | 'variation' | 'dividends' | 'daily_summary';
export type EventPrefs = Record<EventKey, { telegram: boolean; email: boolean }>;

export const DEFAULT_EVENT_PREFS: EventPrefs = {
  price:         { telegram: true,  email: false },
  stop_loss:     { telegram: true,  email: true  },
  take_profit:   { telegram: true,  email: true  },
  variation:     { telegram: true,  email: false },
  dividends:     { telegram: false, email: true  },
  daily_summary: { telegram: false, email: false },
};

export interface TelegramSettings {
  bot_token: string | null;
  chat_id: string | null;
  enabled: boolean;
  notify_email: boolean;
  email_address: string | null;
  event_prefs: EventPrefs;
}

export interface NewAlertInput {
  ticker: string;
  name: string;
  alert_type: AlertType;
  target_value: number;
  notify_telegram: boolean;
  notify_email?: boolean;
  secondary_type?: AlertType | null;
  secondary_value?: number | null;
  condition_logic?: ConditionLogic;
  valid_until?: string | null;
  notes?: string | null;
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    bot_token: null, chat_id: null, enabled: false,
    notify_email: false, email_address: null, event_prefs: DEFAULT_EVENT_PREFS,
  });
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAlerts((data as any[] as AlertRow[]) || []);
  }, [user]);

  const loadTelegramSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from('telegram_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setTelegramSettings({
        bot_token: data.bot_token,
        chat_id: data.chat_id,
        enabled: data.enabled,
        notify_email: data.notify_email ?? false,
        email_address: data.email_address ?? user.email ?? null,
        event_prefs: { ...DEFAULT_EVENT_PREFS, ...(data.event_prefs || {}) },
      });
    } else {
      setTelegramSettings((s) => ({ ...s, email_address: user.email ?? null }));
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([loadAlerts(), loadTelegramSettings()]).then(() => setLoading(false));
  }, [user, loadAlerts, loadTelegramSettings]);

  const addAlert = useCallback(async (alert: NewAlertInput) => {
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      ticker: alert.ticker,
      name: alert.name,
      alert_type: alert.alert_type,
      target_value: alert.target_value,
      notify_telegram: alert.notify_telegram,
      notify_email: alert.notify_email ?? false,
      secondary_type: alert.secondary_type ?? null,
      secondary_value: alert.secondary_value ?? null,
      condition_logic: alert.condition_logic ?? 'OR',
      valid_until: alert.valid_until ?? null,
      notes: alert.notes ?? null,
    };
    const { error } = await supabase.from('alerts').insert(payload);
    if (error) throw error;
    await loadAlerts();
  }, [user, loadAlerts]);

  const deleteAlert = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('alerts').delete().eq('id', id).eq('user_id', user.id);
    await loadAlerts();
  }, [user, loadAlerts]);

  const toggleAlert = useCallback(async (id: string, currentStatus: AlertStatus) => {
    if (!user) return;
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await supabase.from('alerts').update({ status: newStatus }).eq('id', id).eq('user_id', user.id);
    await loadAlerts();
  }, [user, loadAlerts]);

  const reactivateAlert = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('alerts').update({ status: 'active', triggered_at: null }).eq('id', id).eq('user_id', user.id);
    await loadAlerts();
  }, [user, loadAlerts]);

  const saveTelegramSettings = useCallback(async (settings: TelegramSettings) => {
    if (!user) return;
    const { data: existing } = await (supabase as any)
      .from('telegram_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const payload: any = {
      bot_token: settings.bot_token,
      chat_id: settings.chat_id,
      enabled: settings.enabled,
      notify_email: settings.notify_email,
      email_address: settings.email_address,
      event_prefs: settings.event_prefs,
    };

    if (existing) {
      await (supabase as any).from('telegram_settings').update(payload).eq('user_id', user.id);
    } else {
      await (supabase as any).from('telegram_settings').insert({ user_id: user.id, ...payload });
    }
    setTelegramSettings(settings);
  }, [user]);

  return {
    alerts, telegramSettings, loading,
    addAlert, deleteAlert, toggleAlert, reactivateAlert, saveTelegramSettings,
    refresh: loadAlerts,
  };
}

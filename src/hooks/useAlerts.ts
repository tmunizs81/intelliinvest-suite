import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AlertType = 'price_above' | 'price_below' | 'variation_up' | 'variation_down' | 'stop_loss' | 'take_profit';
export type AlertStatus = 'active' | 'triggered' | 'paused';

export interface AlertRow {
  id: string;
  ticker: string;
  name: string;
  alert_type: AlertType;
  target_value: number;
  current_value: number | null;
  status: AlertStatus;
  notify_telegram: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface TelegramSettings {
  bot_token: string | null;
  chat_id: string | null;
  enabled: boolean;
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({ bot_token: null, chat_id: null, enabled: false });
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAlerts((data as AlertRow[]) || []);
  }, [user]);

  const loadTelegramSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('telegram_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setTelegramSettings({ bot_token: data.bot_token, chat_id: data.chat_id, enabled: data.enabled });
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([loadAlerts(), loadTelegramSettings()]).then(() => setLoading(false));
  }, [user, loadAlerts, loadTelegramSettings]);

  const addAlert = useCallback(async (alert: {
    ticker: string; name: string; alert_type: AlertType; target_value: number; notify_telegram: boolean;
  }) => {
    if (!user) return;
    const { error } = await supabase.from('alerts').insert({
      user_id: user.id,
      ...alert,
    });
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
    const { data: existing } = await supabase
      .from('telegram_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('telegram_settings').update({
        bot_token: settings.bot_token,
        chat_id: settings.chat_id,
        enabled: settings.enabled,
      }).eq('user_id', user.id);
    } else {
      await supabase.from('telegram_settings').insert({
        user_id: user.id,
        bot_token: settings.bot_token,
        chat_id: settings.chat_id,
        enabled: settings.enabled,
      });
    }
    setTelegramSettings(settings);
  }, [user]);

  return { alerts, telegramSettings, loading, addAlert, deleteAlert, toggleAlert, reactivateAlert, saveTelegramSettings, refresh: loadAlerts };
}

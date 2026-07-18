
-- Notification preferences on telegram_settings
ALTER TABLE public.telegram_settings
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_address text,
  ADD COLUMN IF NOT EXISTS event_prefs jsonb NOT NULL DEFAULT jsonb_build_object(
    'price',        jsonb_build_object('telegram', true,  'email', false),
    'stop_loss',    jsonb_build_object('telegram', true,  'email', true),
    'take_profit',  jsonb_build_object('telegram', true,  'email', true),
    'variation',    jsonb_build_object('telegram', true,  'email', false),
    'dividends',    jsonb_build_object('telegram', false, 'email', true),
    'daily_summary',jsonb_build_object('telegram', false, 'email', false)
  );

-- Advanced alert fields
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS secondary_type text,
  ADD COLUMN IF NOT EXISTS secondary_value numeric,
  ADD COLUMN IF NOT EXISTS condition_logic text NOT NULL DEFAULT 'OR' CHECK (condition_logic IN ('OR','AND')),
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

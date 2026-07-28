
-- 1) alert_rules
CREATE TABLE public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('patrimony_drop','patrimony_gain','daily_valuation','roi_threshold','fx_stale','daily_summary')),
  threshold_pct NUMERIC,
  threshold_minutes INT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram','email','both')),
  cooldown_minutes INT NOT NULL DEFAULT 60,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_rules_own_select" ON public.alert_rules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "alert_rules_own_insert" ON public.alert_rules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "alert_rules_own_update" ON public.alert_rules FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "alert_rules_own_delete" ON public.alert_rules FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "alert_rules_admin_all"  ON public.alert_rules FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) notification_log
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','suppressed_cooldown')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_log_own_select" ON public.notification_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notification_log_admin_all"  ON public.notification_log FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_notif_log_user_rule_time ON public.notification_log(user_id, rule_id, sent_at DESC);
CREATE INDEX idx_notif_log_user_time ON public.notification_log(user_id, sent_at DESC);

-- 3) Seed defaults for existing users (idempotent)
INSERT INTO public.alert_rules (user_id, kind, threshold_pct, threshold_minutes, enabled)
SELECT DISTINCT p.user_id, k.kind, k.pct, k.min, false
FROM public.profiles p
CROSS JOIN (VALUES
  ('patrimony_drop', 3::NUMERIC, NULL::INT),
  ('patrimony_gain', 5::NUMERIC, NULL::INT),
  ('daily_valuation', 2::NUMERIC, NULL::INT),
  ('roi_threshold', 20::NUMERIC, NULL::INT),
  ('fx_stale', NULL::NUMERIC, 120::INT),
  ('daily_summary', NULL::NUMERIC, NULL::INT)
) AS k(kind, pct, min)
ON CONFLICT (user_id, kind) DO NOTHING;

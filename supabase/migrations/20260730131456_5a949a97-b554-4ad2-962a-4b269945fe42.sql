-- 1) Auditoria de acesso a dados sensíveis --------------------------------
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  _resource TEXT,
  _action TEXT,
  _outcome TEXT DEFAULT 'allowed',
  _target_user UUID DEFAULT NULL,
  _meta JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.security_events
    (function_name, outcome, reason, subject_id, meta)
  VALUES (
    'db:' || _resource,
    COALESCE(_outcome, 'allowed'),
    _action,
    COALESCE(auth.uid()::text, 'anonymous'),
    COALESCE(_meta, '{}'::jsonb)
      || jsonb_build_object(
           'resource', _resource,
           'target_user', _target_user,
           'is_admin', public.has_role(auth.uid(), 'admin'),
           'at', now()
         )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_sensitive_access(TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_sensitive_access(TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

-- 2) O bot_token deixa de ser legível por qualquer sessão do navegador -----
REVOKE SELECT ON public.telegram_settings FROM authenticated;
REVOKE SELECT ON public.telegram_settings FROM anon;
GRANT SELECT (id, user_id, chat_id, enabled, created_at, updated_at, link_code, notify_email, email_address, event_prefs)
  ON public.telegram_settings TO authenticated;
-- gravação continua permitida (token é write-only para o dono da conta)
GRANT INSERT, UPDATE, DELETE ON public.telegram_settings TO authenticated;
GRANT ALL ON public.telegram_settings TO service_role;

-- 3) Leitura segura das próprias configurações (sem token, com auditoria) --
CREATE OR REPLACE FUNCTION public.get_my_telegram_settings()
RETURNS TABLE(
  id UUID,
  chat_id TEXT,
  enabled BOOLEAN,
  notify_email BOOLEAN,
  email_address TEXT,
  event_prefs JSONB,
  link_code TEXT,
  has_bot_token BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    PERFORM public.log_sensitive_access('telegram_settings', 'read_own', 'denied', NULL, '{"reason":"no_session"}');
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM public.log_sensitive_access('telegram_settings', 'read_own', 'allowed', auth.uid());

  RETURN QUERY
  SELECT t.id, t.chat_id, t.enabled, t.notify_email, t.email_address,
         COALESCE(t.event_prefs, '{}'::jsonb), t.link_code,
         (t.bot_token IS NOT NULL AND btrim(t.bot_token) <> ''),
         t.updated_at
    FROM public.telegram_settings t
   WHERE t.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_telegram_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_telegram_settings() TO authenticated, service_role;

-- 4) Visão administrativa: auditada e sem token ---------------------------
CREATE OR REPLACE FUNCTION public.admin_list_telegram_overview()
RETURNS TABLE(
  user_id UUID,
  chat_id TEXT,
  enabled BOOLEAN,
  notify_email BOOLEAN,
  email_address TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso restrito a administradores';
  END IF;

  RETURN QUERY
  SELECT t.user_id, t.chat_id, t.enabled, t.notify_email, t.email_address, t.updated_at
    FROM public.telegram_settings t;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_telegram_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_telegram_overview() TO authenticated, service_role;

-- 5) Consulta da trilha de auditoria --------------------------------------
CREATE OR REPLACE FUNCTION public.list_sensitive_access_log(_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  id UUID,
  resource TEXT,
  action TEXT,
  outcome TEXT,
  subject_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.function_name, e.reason, e.outcome, e.subject_id, e.meta, e.created_at
    FROM public.security_events e
   WHERE e.function_name LIKE 'db:%'
     AND (public.has_role(auth.uid(), 'admin') OR e.subject_id = auth.uid()::text)
   ORDER BY e.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.list_sensitive_access_log(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sensitive_access_log(INTEGER) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS security_events_sensitive_idx
  ON public.security_events (created_at DESC)
  WHERE function_name LIKE 'db:%';
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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    PERFORM public.log_sensitive_access('telegram_settings', 'read_all', 'denied', NULL, '{"reason":"not_admin"}');
    RAISE EXCEPTION 'acesso restrito a administradores';
  END IF;

  PERFORM public.log_sensitive_access('telegram_settings', 'read_all', 'allowed', NULL);

  RETURN QUERY
  SELECT t.user_id, t.chat_id, t.enabled, t.notify_email, t.email_address, t.updated_at
    FROM public.telegram_settings t;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_telegram_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_telegram_overview() TO authenticated, service_role;
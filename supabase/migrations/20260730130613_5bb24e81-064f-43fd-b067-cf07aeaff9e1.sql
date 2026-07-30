-- Admins não precisam (e não devem) enxergar o bot_token de outras contas.
DROP POLICY IF EXISTS "Admins can view all telegram settings" ON public.telegram_settings;

-- Visão administrativa mínima: sem bot_token, sem link_code.
CREATE OR REPLACE FUNCTION public.admin_list_telegram_overview()
RETURNS TABLE (
  user_id uuid,
  chat_id text,
  enabled boolean,
  notify_email boolean,
  email_address text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.user_id, t.chat_id, t.enabled, t.notify_email, t.email_address, t.updated_at
    FROM public.telegram_settings t
   WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.admin_list_telegram_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_telegram_overview() TO authenticated, service_role;
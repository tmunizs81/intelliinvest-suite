-- Funções de gatilho não devem ser invocáveis pela API (PostgREST).
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_assign_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_refresh_portfolio_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_upsert_daily_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_holding_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- has_role é necessária dentro das policies de RLS avaliadas como o próprio usuário.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
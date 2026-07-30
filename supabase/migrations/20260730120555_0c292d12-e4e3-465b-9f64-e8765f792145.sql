-- 1) Bloqueia execução direta das rotinas SECURITY DEFINER que recebem o alvo por parâmetro.
REVOKE ALL ON FUNCTION public.refresh_portfolio_metrics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_daily_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_snapshot_failure(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_snapshot_failure_resolved(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_pending_snapshot_failures(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_all_daily_snapshots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_snapshots() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_portfolio_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_daily_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_snapshot_failure(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_snapshot_failure_resolved(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_snapshot_failures(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_daily_snapshots() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_snapshots() TO service_role;

-- 2) Wrapper seguro para o app: sempre opera sobre auth.uid(), nunca sobre um id vindo do cliente.
CREATE OR REPLACE FUNCTION public.refresh_my_portfolio_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM public.refresh_portfolio_metrics(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_my_portfolio_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_portfolio_metrics() TO authenticated, service_role;

-- 3) Rotinas que já derivam o usuário de auth.uid(): restritas a sessões autenticadas.
REVOKE ALL ON FUNCTION public.get_dashboard_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_bootstrap() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.import_transactions_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transactions_atomic(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated, service_role;
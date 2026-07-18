
REVOKE ALL ON FUNCTION public.upsert_daily_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_upsert_daily_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_old_snapshots() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_all_daily_snapshots() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_daily_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_snapshots() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_daily_snapshots() TO service_role;

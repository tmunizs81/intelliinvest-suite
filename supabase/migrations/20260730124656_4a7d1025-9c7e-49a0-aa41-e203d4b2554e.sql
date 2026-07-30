
REVOKE ALL ON FUNCTION public.list_my_jobs(INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_my_job(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_trace(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.circuit_check(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.circuit_record(TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_security_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_my_jobs(INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_my_job(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trace(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.circuit_check(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.circuit_record(TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_security_data() TO service_role;

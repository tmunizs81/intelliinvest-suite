
DO $$
DECLARE
  v_cmd TEXT;
  v_secret TEXT;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'reconcile-snapshots-15m' LIMIT 1;
  v_secret := substring(v_cmd from '"x-cron-secret":"([^"]+)"');
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'não foi possível recuperar o cron secret existente';
  END IF;

  PERFORM cron.unschedule('job-worker-every-minute') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'job-worker-every-minute');
  PERFORM cron.unschedule('observability-alerts-15m') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'observability-alerts-15m');
  PERFORM cron.unschedule('cleanup-security-data-daily') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-security-data-daily');

  PERFORM cron.schedule(
    'job-worker-every-minute',
    '* * * * *',
    format($f$SELECT net.http_post(
      url := 'https://qysofdyyumoggkptxxuf.supabase.co/functions/v1/job-worker',
      headers := '{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,
      body := '{}'::jsonb
    );$f$, v_secret)
  );

  PERFORM cron.schedule(
    'observability-alerts-15m',
    '*/15 * * * *',
    format($f$SELECT net.http_post(
      url := 'https://qysofdyyumoggkptxxuf.supabase.co/functions/v1/observability-alerts',
      headers := '{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,
      body := '{}'::jsonb
    );$f$, v_secret)
  );

  PERFORM cron.schedule(
    'cleanup-security-data-daily',
    '20 4 * * *',
    'SELECT public.cleanup_security_data();'
  );
END $$;

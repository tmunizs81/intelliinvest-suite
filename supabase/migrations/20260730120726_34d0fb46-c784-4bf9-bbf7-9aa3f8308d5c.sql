-- Reprograma os jobs para enviarem o header x-cron-secret.
DO $$
DECLARE
  v_base text := 'https://qysofdyyumoggkptxxuf.supabase.co/functions/v1/';
  v_secret text := 'a92247839b7db978c91a0ec996e8ee9d2ec6889dc23beb97f123c1a8b0ef086f';
  v_headers text;
  r record;
  jobs jsonb := '[
    {"name":"sync-ondo-gm-tokens-weekly","fn":"sync-ondo-tokens","sched":"0 3 * * 1"},
    {"name":"daily-portfolio-snapshot","fn":"daily-snapshot","sched":"0 22 * * *"},
    {"name":"check-alerts-every-10min","fn":"check-alerts","sched":"*/10 * * * *"},
    {"name":"scheduled-price-refresh-10m","fn":"scheduled-price-refresh","sched":"*/10 * * * *"},
    {"name":"reconcile-snapshots-15m","fn":"reconcile-snapshots","sched":"*/15 * * * *"},
    {"name":"check-alert-rules-10m","fn":"check-alert-rules","sched":"*/10 * * * *"},
    {"name":"telegram-daily-summary-0900brt","fn":"telegram-daily-summary","sched":"0 12 * * *"},
    {"name":"check-market-hours-every-minute","fn":"check-market-hours","sched":"* * * * *"}
  ]'::jsonb;
  j jsonb;
BEGIN
  v_headers := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', v_secret);

  FOR j IN SELECT * FROM jsonb_array_elements(jobs) LOOP
    PERFORM cron.unschedule((j->>'name'));
    PERFORM cron.schedule(
      (j->>'name'),
      (j->>'sched'),
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb) as request_id;',
        v_base || (j->>'fn'),
        v_headers,
        '{"source":"pg_cron"}'
      )
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron reschedule issue: %', SQLERRM;
END $$;
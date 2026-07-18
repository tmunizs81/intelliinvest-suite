
CREATE TABLE IF NOT EXISTS public.snapshot_refresh_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'scheduled-price-refresh',
  attempts INT NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

GRANT SELECT ON public.snapshot_refresh_failures TO authenticated;
GRANT ALL ON public.snapshot_refresh_failures TO service_role;

ALTER TABLE public.snapshot_refresh_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own failures"
  ON public.snapshot_refresh_failures FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_snapfail_pending
  ON public.snapshot_refresh_failures (status, next_retry_at)
  WHERE status = 'pending';

CREATE TRIGGER trg_snapfail_updated_at
  BEFORE UPDATE ON public.snapshot_refresh_failures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Register (or bump) a failure, with exponential backoff capped at 6h and 8 attempts.
CREATE OR REPLACE FUNCTION public.enqueue_snapshot_failure(
  _user_id UUID, _reason TEXT, _source TEXT DEFAULT 'scheduled-price-refresh', _error TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.snapshot_refresh_failures;
  v_delay INTERVAL;
  v_attempts INT;
BEGIN
  SELECT * INTO v_row FROM public.snapshot_refresh_failures
   WHERE user_id = _user_id AND snapshot_date = CURRENT_DATE;

  IF NOT FOUND THEN
    INSERT INTO public.snapshot_refresh_failures
      (user_id, reason, source, last_error, next_retry_at)
    VALUES (_user_id, _reason, _source, _error, now() + INTERVAL '2 minutes');
    RETURN;
  END IF;

  v_attempts := v_row.attempts + 1;
  v_delay := LEAST(INTERVAL '6 hours', (INTERVAL '2 minutes') * POWER(2, v_attempts));

  UPDATE public.snapshot_refresh_failures
     SET attempts = v_attempts,
         reason = _reason,
         last_error = COALESCE(_error, last_error),
         source = _source,
         next_retry_at = now() + v_delay,
         status = CASE WHEN v_attempts >= 8 THEN 'abandoned' ELSE 'pending' END,
         updated_at = now()
   WHERE id = v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_snapshot_failures(_limit INT DEFAULT 50)
RETURNS SETOF public.snapshot_refresh_failures
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.snapshot_refresh_failures
   WHERE status = 'pending' AND next_retry_at <= now()
   ORDER BY next_retry_at ASC
   LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.mark_snapshot_failure_resolved(_user_id UUID)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.snapshot_refresh_failures
     SET status = 'resolved', resolved_at = now(), updated_at = now()
   WHERE user_id = _user_id AND snapshot_date = CURRENT_DATE AND status = 'pending';
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_snapshot_failure(UUID, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_pending_snapshot_failures(INT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_snapshot_failure_resolved(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_snapshot_failure(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_snapshot_failures(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_snapshot_failure_resolved(UUID) TO service_role;

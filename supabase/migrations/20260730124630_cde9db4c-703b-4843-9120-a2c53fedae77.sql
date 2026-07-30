
-- ============ 1. TRACE SPANS (OpenTelemetry-compatible) ============
CREATE TABLE IF NOT EXISTS public.trace_spans (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'INTERNAL',
  service_name TEXT NOT NULL DEFAULT 'simplynvest-edge',
  user_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status_code TEXT NOT NULL DEFAULT 'UNSET',
  error_message TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trace_spans TO authenticated;
GRANT ALL ON public.trace_spans TO service_role;
ALTER TABLE public.trace_spans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read traces" ON public.trace_spans;
CREATE POLICY "admins read traces" ON public.trace_spans
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS trace_spans_span_uidx ON public.trace_spans (trace_id, span_id);
CREATE INDEX IF NOT EXISTS trace_spans_trace_idx ON public.trace_spans (trace_id, started_at);
CREATE INDEX IF NOT EXISTS trace_spans_recent_idx ON public.trace_spans (started_at DESC);
CREATE INDEX IF NOT EXISTS trace_spans_name_idx ON public.trace_spans (name, started_at DESC);

ALTER TABLE public.function_metrics ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE public.function_metrics ADD COLUMN IF NOT EXISTS span_id TEXT;
CREATE INDEX IF NOT EXISTS function_metrics_trace_idx ON public.function_metrics (trace_id);

-- ============ 2. CIRCUIT BREAKER ============
CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  name TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed',
  failures INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  next_probe_at TIMESTAMPTZ,
  last_error TEXT,
  last_latency_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.circuit_breakers TO authenticated;
GRANT ALL ON public.circuit_breakers TO service_role;
ALTER TABLE public.circuit_breakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read breakers" ON public.circuit_breakers;
CREATE POLICY "admins read breakers" ON public.circuit_breakers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Consulta/atualiza o estado do disjuntor de forma atômica.
CREATE OR REPLACE FUNCTION public.circuit_check(_name TEXT, _cooldown_seconds INTEGER DEFAULT 30)
RETURNS TABLE(state TEXT, allowed BOOLEAN, consecutive_failures INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.circuit_breakers;
BEGIN
  INSERT INTO public.circuit_breakers (name) VALUES (_name)
  ON CONFLICT (name) DO NOTHING;

  SELECT * INTO v FROM public.circuit_breakers WHERE name = _name FOR UPDATE;

  IF v.state = 'open' AND v.next_probe_at IS NOT NULL AND v.next_probe_at <= now() THEN
    UPDATE public.circuit_breakers SET state = 'half_open', updated_at = now()
     WHERE name = _name;
    v.state := 'half_open';
  END IF;

  RETURN QUERY SELECT v.state, (v.state <> 'open'), v.consecutive_failures;
END;
$$;

CREATE OR REPLACE FUNCTION public.circuit_record(
  _name TEXT,
  _success BOOLEAN,
  _latency_ms INTEGER DEFAULT NULL,
  _error TEXT DEFAULT NULL,
  _failure_threshold INTEGER DEFAULT 5,
  _cooldown_seconds INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.circuit_breakers;
  v_state TEXT;
  v_cf INTEGER;
BEGIN
  INSERT INTO public.circuit_breakers (name) VALUES (_name)
  ON CONFLICT (name) DO NOTHING;

  SELECT * INTO v FROM public.circuit_breakers WHERE name = _name FOR UPDATE;

  IF _success THEN
    UPDATE public.circuit_breakers
       SET successes = successes + 1,
           consecutive_failures = 0,
           state = 'closed',
           opened_at = NULL,
           next_probe_at = NULL,
           last_error = NULL,
           last_latency_ms = COALESCE(_latency_ms, last_latency_ms),
           updated_at = now()
     WHERE name = _name
     RETURNING state INTO v_state;
    RETURN v_state;
  END IF;

  v_cf := v.consecutive_failures + 1;

  UPDATE public.circuit_breakers
     SET failures = failures + 1,
         consecutive_failures = v_cf,
         last_error = COALESCE(_error, last_error),
         last_latency_ms = COALESCE(_latency_ms, last_latency_ms),
         state = CASE WHEN v_cf >= _failure_threshold OR v.state = 'half_open'
                      THEN 'open' ELSE v.state END,
         opened_at = CASE WHEN v_cf >= _failure_threshold OR v.state = 'half_open'
                          THEN now() ELSE opened_at END,
         next_probe_at = CASE WHEN v_cf >= _failure_threshold OR v.state = 'half_open'
                              THEN now() + make_interval(secs => GREATEST(_cooldown_seconds, 5))
                              ELSE next_probe_at END,
         updated_at = now()
   WHERE name = _name
   RETURNING state INTO v_state;

  RETURN v_state;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.circuit_check(TEXT, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.circuit_record(TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER) FROM anon, authenticated;

-- ============ 3. JOBS: listagem e cancelamento pelo dono ============
CREATE OR REPLACE FUNCTION public.list_my_jobs(_limit INTEGER DEFAULT 50, _status TEXT DEFAULT NULL)
RETURNS TABLE(
  id UUID, job_type TEXT, status TEXT, priority INTEGER, attempts INTEGER,
  max_attempts INTEGER, payload JSONB, result JSONB, last_error TEXT,
  created_at TIMESTAMPTZ, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  duration_ms INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.job_type, j.status, j.priority, j.attempts, j.max_attempts,
         j.payload, j.result, j.last_error, j.created_at, j.started_at, j.finished_at,
         CASE WHEN j.started_at IS NOT NULL
              THEN (EXTRACT(EPOCH FROM (COALESCE(j.finished_at, now()) - j.started_at)) * 1000)::INTEGER
         END
    FROM public.job_queue j
   WHERE j.user_id = auth.uid()
     AND (_status IS NULL OR j.status = _status)
   ORDER BY j.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_job(_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v public.job_queue;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v FROM public.job_queue
   WHERE id = _job_id AND user_id = auth.uid() FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v.status IN ('done', 'failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_finished', 'status', v.status);
  END IF;

  IF v.status = 'running' THEN
    -- Já está em execução: marca para não reprocessar em novas tentativas.
    UPDATE public.job_queue
       SET status = 'cancelled', finished_at = now(), updated_at = now(),
           last_error = 'cancelado pelo usuário durante execução'
     WHERE id = _job_id;
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'note', 'execução em andamento será descartada');
  END IF;

  UPDATE public.job_queue
     SET status = 'cancelled', finished_at = now(), updated_at = now(),
         last_error = 'cancelado pelo usuário'
   WHERE id = _job_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_jobs(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_job(UUID) TO authenticated;

-- ============ 4. Trace lookup para o painel admin ============
CREATE OR REPLACE FUNCTION public.get_trace(_trace_id TEXT)
RETURNS SETOF public.trace_spans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.trace_spans
   WHERE trace_id = _trace_id
     AND public.has_role(auth.uid(), 'admin')
   ORDER BY started_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_trace(TEXT) TO authenticated;

-- ============ 5. Limpeza de traces antigos ============
CREATE OR REPLACE FUNCTION public.cleanup_security_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_tmp INTEGER;
BEGIN
  DELETE FROM public.api_rate_limits WHERE window_start < now() - INTERVAL '1 day';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  DELETE FROM public.security_events WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  DELETE FROM public.trace_spans WHERE started_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  RETURN v_deleted;
END;
$$;

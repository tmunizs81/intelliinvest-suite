
-- =========================================================
-- 1) HTTP / MARKET DATA CACHE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.http_cache (
  id BIGSERIAL PRIMARY KEY,
  namespace TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.http_cache TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.http_cache_id_seq TO service_role;
ALTER TABLE public.http_cache ENABLE ROW LEVEL SECURITY;
-- Sem policies: acessível somente pelo service_role (edge functions).

CREATE UNIQUE INDEX IF NOT EXISTS http_cache_ns_key_uidx
  ON public.http_cache (namespace, cache_key);
CREATE INDEX IF NOT EXISTS http_cache_expires_idx
  ON public.http_cache (expires_at);

-- Leitura atômica: devolve payload válido e incrementa hit_count.
CREATE OR REPLACE FUNCTION public.http_cache_get(_namespace TEXT, _key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  UPDATE public.http_cache
     SET hit_count = hit_count + 1, updated_at = now()
   WHERE namespace = _namespace
     AND cache_key = _key
     AND expires_at > now()
  RETURNING payload INTO v_payload;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.http_cache_put(
  _namespace TEXT, _key TEXT, _payload JSONB, _ttl_seconds INTEGER
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.http_cache (namespace, cache_key, payload, expires_at)
  VALUES (_namespace, _key, _payload, now() + make_interval(secs => GREATEST(_ttl_seconds, 1)))
  ON CONFLICT (namespace, cache_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        expires_at = EXCLUDED.expires_at,
        hit_count = 0,
        updated_at = now();
$$;

-- Invalidação (por namespace inteiro ou prefixo de chave).
CREATE OR REPLACE FUNCTION public.http_cache_invalidate(_namespace TEXT, _key_prefix TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM public.http_cache
   WHERE namespace = _namespace
     AND (_key_prefix IS NULL OR cache_key LIKE _key_prefix || '%');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.http_cache_get(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.http_cache_put(TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.http_cache_invalidate(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.http_cache_get(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.http_cache_put(TEXT, TEXT, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.http_cache_invalidate(TEXT, TEXT) TO service_role;

-- =========================================================
-- 2) ÍNDICES DE PERFORMANCE
-- =========================================================
-- Rate limit: lookup é sempre pela chave única; o cleanup varre por window_start.
CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx
  ON public.api_rate_limits (window_start);

-- Security events: consultas por função/tempo e por subject/tempo.
CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_fn_created_idx
  ON public.security_events (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_subject_created_idx
  ON public.security_events (subject_id, created_at DESC)
  WHERE subject_id IS NOT NULL;

-- Métricas: dashboards agregam por função e janela de tempo.
CREATE INDEX IF NOT EXISTS function_metrics_fn_created_idx
  ON public.function_metrics (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS function_metrics_created_idx
  ON public.function_metrics (created_at DESC);

-- Snapshots: leitura é sempre user + data desc.
CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_date_idx
  ON public.portfolio_snapshots (user_id, snapshot_date DESC);

-- =========================================================
-- 3) FILA DE JOBS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  dedupe_key TEXT,
  result JSONB,
  last_error TEXT,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_queue_status_chk CHECK (status IN ('pending','running','done','failed','cancelled'))
);

GRANT SELECT ON public.job_queue TO authenticated;
GRANT ALL ON public.job_queue TO service_role;
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jobs"
  ON public.job_queue FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS job_queue_claim_idx
  ON public.job_queue (status, run_after, priority DESC);
CREATE INDEX IF NOT EXISTS job_queue_user_idx
  ON public.job_queue (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS job_queue_dedupe_uidx
  ON public.job_queue (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending','running');

CREATE TRIGGER job_queue_set_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enfileira usando a identidade autenticada; limita fila por usuário.
CREATE OR REPLACE FUNCTION public.enqueue_job(
  _job_type TEXT,
  _payload JSONB DEFAULT '{}'::jsonb,
  _dedupe_key TEXT DEFAULT NULL,
  _priority INTEGER DEFAULT 5
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pending INT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _job_type IS NULL OR btrim(_job_type) = '' THEN
    RAISE EXCEPTION 'job_type obrigatório';
  END IF;

  -- Dedupe: se já existe job equivalente ativo, devolve o existente.
  IF _dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.job_queue
     WHERE job_type = _job_type AND dedupe_key = _dedupe_key
       AND status IN ('pending','running')
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT count(*) INTO v_pending FROM public.job_queue
   WHERE user_id = v_uid AND status IN ('pending','running');
  IF v_pending >= 20 THEN
    RAISE EXCEPTION 'fila cheia: aguarde o processamento das tarefas atuais';
  END IF;

  INSERT INTO public.job_queue (user_id, job_type, payload, dedupe_key, priority)
  VALUES (v_uid, _job_type, COALESCE(_payload, '{}'::jsonb), _dedupe_key, LEAST(GREATEST(_priority, 1), 9))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Worker: reivindica jobs com SKIP LOCKED e concorrência máxima por usuário.
CREATE OR REPLACE FUNCTION public.claim_jobs(
  _limit INTEGER DEFAULT 5,
  _max_per_user INTEGER DEFAULT 1,
  _lock_timeout_seconds INTEGER DEFAULT 300
) RETURNS SETOF public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Libera jobs travados por workers mortos.
  UPDATE public.job_queue
     SET status = 'pending', locked_at = NULL
   WHERE status = 'running'
     AND locked_at < now() - make_interval(secs => GREATEST(_lock_timeout_seconds, 30));

  RETURN QUERY
  WITH busy AS (
    SELECT user_id, count(*) AS running
      FROM public.job_queue
     WHERE status = 'running'
     GROUP BY user_id
  ),
  candidates AS (
    SELECT j.id
      FROM public.job_queue j
      LEFT JOIN busy b ON b.user_id = j.user_id
     WHERE j.status = 'pending'
       AND j.run_after <= now()
       AND COALESCE(b.running, 0) < GREATEST(_max_per_user, 1)
     ORDER BY j.priority DESC, j.created_at ASC
     LIMIT GREATEST(_limit, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue q
     SET status = 'running',
         attempts = q.attempts + 1,
         locked_at = now(),
         started_at = COALESCE(q.started_at, now()),
         updated_at = now()
    FROM candidates c
   WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(
  _job_id UUID, _result JSONB DEFAULT NULL, _error TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.job_queue;
BEGIN
  SELECT * INTO v_job FROM public.job_queue WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF _error IS NULL THEN
    UPDATE public.job_queue
       SET status = 'done', result = _result, last_error = NULL,
           finished_at = now(), locked_at = NULL, updated_at = now()
     WHERE id = _job_id;
  ELSIF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.job_queue
       SET status = 'failed', last_error = _error,
           finished_at = now(), locked_at = NULL, updated_at = now()
     WHERE id = _job_id;
  ELSE
    UPDATE public.job_queue
       SET status = 'pending', last_error = _error, locked_at = NULL,
           run_after = now() + make_interval(secs => LEAST(600, 15 * POWER(2, v_job.attempts))::int),
           updated_at = now()
     WHERE id = _job_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_job(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_job(UUID, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_job(TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_job(TEXT, JSONB, TEXT, INTEGER) TO authenticated, service_role;

-- =========================================================
-- 4) OBSERVABILIDADE
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_observability_dashboard(_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - make_interval(hours => GREATEST(_hours, 1));
  v_routes JSONB;
  v_rejections JSONB;
  v_ai JSONB;
  v_cache JSONB;
  v_queue JSONB;
  v_timeline JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso restrito a administradores';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'p95_ms')::numeric DESC), '[]'::jsonb) INTO v_routes
  FROM (
    SELECT jsonb_build_object(
      'function_name', function_name,
      'calls', count(*),
      'avg_ms', round(avg(duration_ms)::numeric, 1),
      'p95_ms', round((percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms))::numeric, 1),
      'max_ms', max(duration_ms),
      'error_rate', round((count(*) FILTER (WHERE status_code >= 500))::numeric / NULLIF(count(*),0) * 100, 2),
      'cache_hit_rate', round((count(*) FILTER (WHERE cache_hit))::numeric / NULLIF(count(*),0) * 100, 2),
      'cold_starts', count(*) FILTER (WHERE (meta->>'cold_start')::boolean IS TRUE),
      'tokens', COALESCE(sum(COALESCE(tokens_in,0) + COALESCE(tokens_out,0)), 0)
    ) AS r
    FROM public.function_metrics
    WHERE created_at >= v_since
    GROUP BY function_name
  ) x;

  SELECT jsonb_build_object(
    'total', count(*),
    'rate_limited', count(*) FILTER (WHERE outcome = 'rate_limited'),
    'denied', count(*) FILTER (WHERE outcome = 'denied'),
    'by_function', COALESCE((
      SELECT jsonb_object_agg(function_name, c) FROM (
        SELECT function_name, count(*) AS c FROM public.security_events
         WHERE created_at >= v_since AND outcome <> 'allowed'
         GROUP BY function_name ORDER BY 2 DESC LIMIT 15
      ) f
    ), '{}'::jsonb)
  ) INTO v_rejections
  FROM public.security_events WHERE created_at >= v_since;

  SELECT jsonb_build_object(
    'calls', count(*),
    'tokens_in', COALESCE(sum(tokens_in), 0),
    'tokens_out', COALESCE(sum(tokens_out), 0),
    -- custo estimado DeepSeek: US$0.27/1M in, US$1.10/1M out
    'estimated_cost_usd', round(
      (COALESCE(sum(tokens_in),0) * 0.00000027 + COALESCE(sum(tokens_out),0) * 0.0000011)::numeric, 4),
    'cache_hit_rate', round((count(*) FILTER (WHERE cache_hit))::numeric / NULLIF(count(*),0) * 100, 2)
  ) INTO v_ai
  FROM public.function_metrics
  WHERE created_at >= v_since AND function_name LIKE 'ai-%';

  SELECT jsonb_build_object(
    'entries', count(*),
    'live_entries', count(*) FILTER (WHERE expires_at > now()),
    'total_hits', COALESCE(sum(hit_count), 0),
    'by_namespace', COALESCE((
      SELECT jsonb_object_agg(namespace, jsonb_build_object('entries', c, 'hits', h)) FROM (
        SELECT namespace, count(*) c, COALESCE(sum(hit_count),0) h
          FROM public.http_cache GROUP BY namespace
      ) n
    ), '{}'::jsonb)
  ) INTO v_cache FROM public.http_cache;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'running', count(*) FILTER (WHERE status = 'running'),
    'failed', count(*) FILTER (WHERE status = 'failed' AND created_at >= v_since),
    'done', count(*) FILTER (WHERE status = 'done' AND created_at >= v_since),
    'avg_duration_ms', COALESCE(round(avg(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)
      FILTER (WHERE status = 'done' AND finished_at IS NOT NULL)::numeric, 0), 0)
  ) INTO v_queue FROM public.job_queue;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'bucket'), '[]'::jsonb) INTO v_timeline
  FROM (
    SELECT jsonb_build_object(
      'bucket', to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00'),
      'calls', count(*),
      'avg_ms', round(avg(duration_ms)::numeric, 1),
      'errors', count(*) FILTER (WHERE status_code >= 500)
    ) AS t
    FROM public.function_metrics
    WHERE created_at >= v_since
    GROUP BY date_trunc('hour', created_at)
  ) y;

  RETURN jsonb_build_object(
    'since', v_since, 'generated_at', now(),
    'routes', v_routes, 'rejections', v_rejections,
    'ai', v_ai, 'cache', v_cache, 'queue', v_queue, 'timeline', v_timeline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_observability_dashboard(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_observability_dashboard(INTEGER) TO authenticated, service_role;

-- =========================================================
-- 5) LIMPEZA
-- =========================================================
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

  DELETE FROM public.http_cache WHERE expires_at < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  DELETE FROM public.job_queue
   WHERE status IN ('done','failed','cancelled') AND created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  DELETE FROM public.function_metrics WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_deleted := v_deleted + v_tmp;

  RETURN v_deleted;
END;
$$;

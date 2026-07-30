-- ============================================================
-- 1) Rate limiting persistido por (usuário, recurso, janela)
-- ============================================================
CREATE TABLE public.api_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX api_rate_limits_key_uidx
  ON public.api_rate_limits (subject_id, resource, window_start, window_seconds);

CREATE INDEX api_rate_limits_window_idx
  ON public.api_rate_limits (window_start);

GRANT SELECT ON public.api_rate_limits TO authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rate limit counters"
  ON public.api_rate_limits FOR SELECT TO authenticated
  USING (subject_id = auth.uid()::text);

-- ============================================================
-- 2) Trilha de auditoria de segurança
-- ============================================================
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'denied',
  reason TEXT NOT NULL,
  status_code INTEGER,
  subject_id TEXT,
  claims JSONB,
  ip TEXT,
  user_agent TEXT,
  key_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX security_events_created_idx ON public.security_events (created_at DESC);
CREATE INDEX security_events_function_idx ON public.security_events (function_name, created_at DESC);
CREATE INDEX security_events_subject_idx ON public.security_events (subject_id, created_at DESC);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3) Contador atômico (chamado apenas pelo service_role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _subject_id TEXT,
  _resource TEXT,
  _max_requests INTEGER,
  _window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF _subject_id IS NULL OR btrim(_subject_id) = '' THEN
    RAISE EXCEPTION 'subject_id obrigatório';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / GREATEST(_window_seconds, 1)) * GREATEST(_window_seconds, 1)
  );

  INSERT INTO public.api_rate_limits AS r
    (subject_id, resource, window_start, window_seconds, request_count)
  VALUES (_subject_id, _resource, v_window_start, _window_seconds, 1)
  ON CONFLICT (subject_id, resource, window_start, window_seconds)
  DO UPDATE SET request_count = r.request_count + 1, updated_at = now()
  RETURNING r.request_count INTO v_count;

  RETURN QUERY SELECT
    (v_count <= _max_requests),
    v_count,
    GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => _window_seconds) - now())))::INTEGER
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- 4) Limpeza de dados antigos
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_security_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_tmp INTEGER;
BEGIN
  DELETE FROM public.api_rate_limits WHERE window_start < now() - INTERVAL '1 day';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_deleted := v_deleted + v_tmp;

  DELETE FROM public.security_events WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_deleted := v_deleted + v_tmp;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_security_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_security_data() TO service_role;
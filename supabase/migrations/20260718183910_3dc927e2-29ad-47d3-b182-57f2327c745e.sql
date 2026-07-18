
CREATE TABLE IF NOT EXISTS public.function_metrics (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  user_id UUID,
  duration_ms INT NOT NULL,
  status_code INT NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  tokens_in INT,
  tokens_out INT,
  error_message TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.function_metrics TO authenticated;
GRANT ALL ON public.function_metrics TO service_role;

ALTER TABLE public.function_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read metrics"
  ON public.function_metrics
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role writes metrics"
  ON public.function_metrics
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fm_created ON public.function_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fm_func_created ON public.function_metrics(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fm_status ON public.function_metrics(status_code) WHERE status_code >= 400;

-- Aggregated view for dashboards (last 24h)
CREATE OR REPLACE VIEW public.function_metrics_24h AS
SELECT
  function_name,
  COUNT(*) AS calls,
  ROUND(AVG(duration_ms)::numeric, 1) AS avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) AS cache_hits,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
  COALESCE(SUM(tokens_in), 0) AS tokens_in,
  COALESCE(SUM(tokens_out), 0) AS tokens_out
FROM public.function_metrics
WHERE created_at > now() - interval '24 hours'
GROUP BY function_name
ORDER BY calls DESC;

GRANT SELECT ON public.function_metrics_24h TO authenticated;

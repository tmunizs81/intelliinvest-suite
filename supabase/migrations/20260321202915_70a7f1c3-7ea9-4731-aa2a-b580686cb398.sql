
CREATE TABLE public.ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash text NOT NULL,
  function_name text NOT NULL,
  model text,
  response_text text NOT NULL,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_ai_cache_lookup ON public.ai_cache (prompt_hash, function_name);
CREATE INDEX idx_ai_cache_expires ON public.ai_cache (expires_at);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage ai_cache"
  ON public.ai_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read ai_cache"
  ON public.ai_cache FOR SELECT TO authenticated
  USING (true);

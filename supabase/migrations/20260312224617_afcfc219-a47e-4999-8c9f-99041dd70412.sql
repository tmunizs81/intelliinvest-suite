
CREATE TABLE public.ondo_gm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  name text NOT NULL,
  underlying_ticker text NOT NULL,
  chain_id integer DEFAULT 1,
  token_address text,
  logo_uri text,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow public read access (no auth needed for token list)
ALTER TABLE public.ondo_gm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ondo_gm_tokens"
  ON public.ondo_gm_tokens
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service role can insert/update (edge function)
CREATE POLICY "Service role can manage ondo_gm_tokens"
  ON public.ondo_gm_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_ondo_gm_symbol ON public.ondo_gm_tokens (symbol);
CREATE INDEX idx_ondo_gm_underlying ON public.ondo_gm_tokens (underlying_ticker);

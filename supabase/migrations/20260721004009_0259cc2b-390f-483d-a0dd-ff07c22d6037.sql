
CREATE TABLE public.broker_logo_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  url TEXT NOT NULL,
  format TEXT,
  width INT,
  height INT,
  size_bytes INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_logo_overrides TO authenticated;
GRANT ALL ON public.broker_logo_overrides TO service_role;

ALTER TABLE public.broker_logo_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own broker logo overrides"
  ON public.broker_logo_overrides FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_broker_logo_overrides_updated_at
  BEFORE UPDATE ON public.broker_logo_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

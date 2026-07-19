
CREATE TABLE public.ai_trader_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,
  entry_price NUMERIC,
  stop_price NUMERIC,
  target_price NUMERIC,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  outcome_pct NUMERIC,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_trader_decisions_user_created_idx ON public.ai_trader_decisions(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_trader_decisions TO authenticated;
GRANT ALL ON public.ai_trader_decisions TO service_role;
ALTER TABLE public.ai_trader_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own decisions" ON public.ai_trader_decisions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_ai_trader_decisions_updated
  BEFORE UPDATE ON public.ai_trader_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cash_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cash_balance_user_id_idx ON public.cash_balance (user_id);

ALTER TABLE public.cash_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balance" ON public.cash_balance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own balance" ON public.cash_balance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own balance" ON public.cash_balance FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Add broker column to cash_balance (nullable for backwards compat with existing rows)
ALTER TABLE public.cash_balance ADD COLUMN IF NOT EXISTS broker text DEFAULT null;

-- Drop existing unique constraint on user_id if exists
DO $$
BEGIN
  -- Remove any unique index on just user_id
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'cash_balance' AND indexdef LIKE '%user_id%' AND indexdef NOT LIKE '%broker%' AND indexname LIKE '%unique%') THEN
    EXECUTE (SELECT 'DROP INDEX IF EXISTS ' || indexname FROM pg_indexes WHERE tablename = 'cash_balance' AND indexdef LIKE '%user_id%' AND indexdef NOT LIKE '%broker%' AND indexname LIKE '%unique%' LIMIT 1);
  END IF;
END $$;

-- Add unique constraint on (user_id, broker) - broker null means "sem corretora"
CREATE UNIQUE INDEX IF NOT EXISTS cash_balance_user_broker_unique ON public.cash_balance (user_id, COALESCE(broker, ''));

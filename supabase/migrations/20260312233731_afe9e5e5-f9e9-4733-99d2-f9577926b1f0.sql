
-- Drop the old unique constraint on (user_id, ticker)
ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS holdings_user_id_ticker_key;

-- Create new unique constraint on (user_id, ticker, broker)
-- Using COALESCE to handle NULL brokers consistently
CREATE UNIQUE INDEX holdings_user_id_ticker_broker_key ON public.holdings (user_id, ticker, COALESCE(broker, ''));

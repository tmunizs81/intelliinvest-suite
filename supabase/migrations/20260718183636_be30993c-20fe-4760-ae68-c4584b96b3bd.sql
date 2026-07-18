
-- Phase 3: Server-side portfolio metrics (regular table + refresh function + triggers)
CREATE TABLE IF NOT EXISTS public.portfolio_daily_metrics (
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_invested NUMERIC NOT NULL DEFAULT 0,
  total_positions INT NOT NULL DEFAULT 0,
  distinct_tickers INT NOT NULL DEFAULT 0,
  by_type JSONB NOT NULL DEFAULT '{}'::jsonb,
  by_broker JSONB NOT NULL DEFAULT '{}'::jsonb,
  by_sector JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_holdings JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, metric_date)
);

GRANT SELECT ON public.portfolio_daily_metrics TO authenticated;
GRANT ALL ON public.portfolio_daily_metrics TO service_role;

ALTER TABLE public.portfolio_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own metrics" ON public.portfolio_daily_metrics
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Refresh function: recomputes today's metrics for a given user
CREATE OR REPLACE FUNCTION public.refresh_portfolio_metrics(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_invested NUMERIC := 0;
  v_total_positions INT := 0;
  v_distinct INT := 0;
  v_by_type JSONB;
  v_by_broker JSONB;
  v_by_sector JSONB;
  v_top JSONB;
BEGIN
  SELECT
    COALESCE(SUM(quantity * avg_price), 0),
    COUNT(*),
    COUNT(DISTINCT ticker)
  INTO v_total_invested, v_total_positions, v_distinct
  FROM public.holdings WHERE user_id = _user_id;

  SELECT COALESCE(jsonb_object_agg(t, v), '{}'::jsonb) INTO v_by_type FROM (
    SELECT COALESCE(type,'OUTROS') AS t, SUM(quantity*avg_price) AS v
    FROM public.holdings WHERE user_id=_user_id GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_object_agg(t, v), '{}'::jsonb) INTO v_by_broker FROM (
    SELECT COALESCE(broker,'N/A') AS t, SUM(quantity*avg_price) AS v
    FROM public.holdings WHERE user_id=_user_id GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_object_agg(t, v), '{}'::jsonb) INTO v_by_sector FROM (
    SELECT COALESCE(sector,'N/A') AS t, SUM(quantity*avg_price) AS v
    FROM public.holdings WHERE user_id=_user_id GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top FROM (
    SELECT ticker, name, type, broker, quantity, avg_price,
           (quantity*avg_price) AS invested
    FROM public.holdings WHERE user_id=_user_id
    ORDER BY quantity*avg_price DESC LIMIT 10
  ) t;

  INSERT INTO public.portfolio_daily_metrics AS m
    (user_id, metric_date, total_invested, total_positions, distinct_tickers,
     by_type, by_broker, by_sector, top_holdings, updated_at)
  VALUES (_user_id, CURRENT_DATE, v_total_invested, v_total_positions, v_distinct,
          v_by_type, v_by_broker, v_by_sector, v_top, now())
  ON CONFLICT (user_id, metric_date) DO UPDATE SET
    total_invested = EXCLUDED.total_invested,
    total_positions = EXCLUDED.total_positions,
    distinct_tickers = EXCLUDED.distinct_tickers,
    by_type = EXCLUDED.by_type,
    by_broker = EXCLUDED.by_broker,
    by_sector = EXCLUDED.by_sector,
    top_holdings = EXCLUDED.top_holdings,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_portfolio_metrics(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_portfolio_metrics(UUID) TO authenticated, service_role;

-- Trigger: whenever holdings change, refresh metrics for that user
CREATE OR REPLACE FUNCTION public.trg_refresh_portfolio_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := COALESCE(NEW.user_id, OLD.user_id);
  IF v_uid IS NOT NULL THEN
    PERFORM public.refresh_portfolio_metrics(v_uid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS holdings_refresh_metrics ON public.holdings;
CREATE TRIGGER holdings_refresh_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.holdings
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_portfolio_metrics();

CREATE INDEX IF NOT EXISTS idx_pdm_user_date ON public.portfolio_daily_metrics(user_id, metric_date DESC);

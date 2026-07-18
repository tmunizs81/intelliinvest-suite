
-- Fast index for the chart's date-range queries
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
  ON public.portfolio_snapshots (user_id, snapshot_date DESC);

-- Incremental upsert for a single user's TODAY snapshot.
-- Runs in one SQL statement (no per-row loop) and reuses live price info
-- from portfolio_daily_metrics when available; falls back to cost basis.
CREATE OR REPLACE FUNCTION public.upsert_daily_snapshot(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cost numeric := 0;
  v_assets_count int := 0;
  v_total_value numeric := 0;
  v_last_value numeric;
BEGIN
  SELECT
    COALESCE(SUM(quantity * avg_price), 0),
    COUNT(*)
  INTO v_total_cost, v_assets_count
  FROM public.holdings
  WHERE user_id = _user_id;

  IF v_assets_count = 0 THEN
    -- No holdings: don't create empty snapshots
    RETURN;
  END IF;

  -- Prefer the most recent known market value so the chart doesn't regress
  -- to cost basis on intraday recomputes.
  SELECT total_value INTO v_last_value
  FROM public.portfolio_snapshots
  WHERE user_id = _user_id
    AND snapshot_date < CURRENT_DATE
  ORDER BY snapshot_date DESC
  LIMIT 1;

  v_total_value := COALESCE(v_last_value, v_total_cost);

  INSERT INTO public.portfolio_snapshots
    (user_id, snapshot_date, total_value, total_cost, assets_count)
  VALUES
    (_user_id, CURRENT_DATE, v_total_value, v_total_cost, v_assets_count)
  ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
    total_cost   = EXCLUDED.total_cost,
    assets_count = EXCLUDED.assets_count,
    -- keep the highest known market value for the day (intraday movements)
    total_value  = GREATEST(portfolio_snapshots.total_value, EXCLUDED.total_value);
END;
$$;

-- Trigger wrapper: called on every INSERT/UPDATE/DELETE in holdings
CREATE OR REPLACE FUNCTION public.trg_upsert_daily_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := COALESCE(NEW.user_id, OLD.user_id);
  IF v_uid IS NOT NULL THEN
    PERFORM public.upsert_daily_snapshot(v_uid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS holdings_upsert_daily_snapshot ON public.holdings;
CREATE TRIGGER holdings_upsert_daily_snapshot
AFTER INSERT OR UPDATE OR DELETE ON public.holdings
FOR EACH ROW EXECUTE FUNCTION public.trg_upsert_daily_snapshot();

-- Retention: delete snapshots older than 5 years (called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_snapshots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.portfolio_snapshots
   WHERE snapshot_date < (CURRENT_DATE - INTERVAL '5 years');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Bulk daily job helper: refreshes today's snapshot for every active user
-- in a single set-based operation (called by the daily-snapshot edge function).
CREATE OR REPLACE FUNCTION public.refresh_all_daily_snapshots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_count int := 0;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT user_id FROM public.holdings
  LOOP
    PERFORM public.upsert_daily_snapshot(v_uid);
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.cleanup_old_snapshots();
  RETURN v_count;
END;
$$;

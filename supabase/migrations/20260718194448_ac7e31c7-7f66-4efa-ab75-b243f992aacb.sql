CREATE OR REPLACE FUNCTION public.get_dashboard_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_metrics jsonb;
  v_holdings jsonb;
  v_snapshots jsonb;
  v_cash jsonb;
  v_alerts jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT to_jsonb(m.*) INTO v_metrics
  FROM public.portfolio_daily_metrics m
  WHERE m.user_id = v_uid
  ORDER BY m.metric_date DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(h.*) ORDER BY (h.quantity*h.avg_price) DESC), '[]'::jsonb)
    INTO v_holdings
  FROM public.holdings h
  WHERE h.user_id = v_uid;

  SELECT COALESCE(jsonb_agg(to_jsonb(s.*) ORDER BY s.snapshot_date ASC), '[]'::jsonb)
    INTO v_snapshots
  FROM (
    SELECT * FROM public.portfolio_snapshots
    WHERE user_id = v_uid
    ORDER BY snapshot_date DESC
    LIMIT 90
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb) INTO v_cash
  FROM public.cash_balance c
  WHERE c.user_id = v_uid;

  SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_alerts
  FROM public.alerts a
  WHERE a.user_id = v_uid AND COALESCE(a.is_active, true) = true;

  RETURN jsonb_build_object(
    'metrics', v_metrics,
    'holdings', v_holdings,
    'snapshots', v_snapshots,
    'cash', v_cash,
    'alerts', v_alerts,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_bootstrap() TO authenticated;
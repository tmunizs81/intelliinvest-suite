
CREATE OR REPLACE FUNCTION public.import_transactions_atomic(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_count_tx int := 0;
  v_count_hold int := 0;
  v_ticker text;
  v_name text;
  v_type text;
  v_operation text;
  v_qty numeric;
  v_price numeric;
  v_fees numeric;
  v_date date;
  v_broker text;
  v_sector text;
  v_notes text;
  v_is_dt boolean;
  v_existing RECORD;
  v_new_qty numeric;
  v_new_avg numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_ticker := upper(trim(coalesce(v_row->>'ticker','')));
    v_name := coalesce(v_row->>'name', v_ticker);
    v_type := coalesce(v_row->>'type', 'ACAO');
    v_operation := upper(coalesce(v_row->>'operation','COMPRA'));
    v_qty := (v_row->>'quantity')::numeric;
    v_price := (v_row->>'price')::numeric;
    v_fees := coalesce((v_row->>'fees')::numeric, 0);
    v_date := coalesce((v_row->>'date')::date, current_date);
    v_broker := v_row->>'broker';
    v_sector := v_row->>'sector';
    v_notes := v_row->>'notes';
    v_is_dt := coalesce((v_row->>'is_daytrade')::boolean, false);

    IF v_ticker = '' OR v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'invalid row: %', v_row;
    END IF;
    IF v_operation NOT IN ('COMPRA','VENDA') THEN
      RAISE EXCEPTION 'invalid operation for %: %', v_ticker, v_operation;
    END IF;

    INSERT INTO public.transactions
      (user_id, ticker, name, type, operation, quantity, price, total, fees, date, is_daytrade, notes)
    VALUES
      (v_uid, v_ticker, v_name, v_type, v_operation, v_qty, v_price,
       (v_qty*v_price) + CASE WHEN v_operation='COMPRA' THEN v_fees ELSE -v_fees END,
       v_fees, v_date, v_is_dt, v_notes);
    v_count_tx := v_count_tx + 1;

    SELECT * INTO v_existing FROM public.holdings
     WHERE user_id = v_uid AND ticker = v_ticker
       AND coalesce(broker,'') = coalesce(v_broker,'')
     FOR UPDATE;

    IF NOT FOUND THEN
      IF v_operation = 'VENDA' THEN
        RAISE EXCEPTION 'cannot sell % without existing position', v_ticker;
      END IF;
      INSERT INTO public.holdings
        (user_id, ticker, name, type, quantity, avg_price, broker, sector)
      VALUES (v_uid, v_ticker, v_name, v_type, v_qty, v_price, v_broker, v_sector);
      v_count_hold := v_count_hold + 1;
    ELSE
      IF v_operation = 'COMPRA' THEN
        v_new_qty := v_existing.quantity + v_qty;
        v_new_avg := ((v_existing.quantity * v_existing.avg_price) + (v_qty * v_price)) / NULLIF(v_new_qty,0);
        UPDATE public.holdings
           SET quantity = v_new_qty, avg_price = v_new_avg, updated_at = now()
         WHERE id = v_existing.id;
      ELSE
        v_new_qty := v_existing.quantity - v_qty;
        IF v_new_qty < 0 THEN
          RAISE EXCEPTION 'sell qty exceeds position for %', v_ticker;
        ELSIF v_new_qty = 0 THEN
          DELETE FROM public.holdings WHERE id = v_existing.id;
        ELSE
          UPDATE public.holdings SET quantity = v_new_qty, updated_at = now() WHERE id = v_existing.id;
        END IF;
      END IF;
      v_count_hold := v_count_hold + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_portfolio_metrics(v_uid);

  RETURN jsonb_build_object('transactions', v_count_tx, 'holdings_affected', v_count_hold);
END;
$$;

REVOKE ALL ON FUNCTION public.import_transactions_atomic(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_transactions_atomic(jsonb) TO authenticated;

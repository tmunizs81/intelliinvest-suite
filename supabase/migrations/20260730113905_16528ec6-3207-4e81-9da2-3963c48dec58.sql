-- 1) Normalização determinística de ticker/broker antes de qualquer validação
CREATE OR REPLACE FUNCTION public.normalize_holding_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ticker := upper(btrim(NEW.ticker));
  IF NEW.ticker = '' THEN
    RAISE EXCEPTION 'ticker cannot be empty';
  END IF;

  NEW.broker := NULLIF(btrim(COALESCE(NEW.broker, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_holding_identity ON public.holdings;
CREATE TRIGGER trg_normalize_holding_identity
BEFORE INSERT OR UPDATE ON public.holdings
FOR EACH ROW EXECUTE FUNCTION public.normalize_holding_identity();

-- 2) Normaliza dados existentes (idempotente)
UPDATE public.holdings
   SET ticker = upper(btrim(ticker)),
       broker = NULLIF(btrim(COALESCE(broker, '')), '')
 WHERE ticker <> upper(btrim(ticker))
    OR broker IS DISTINCT FROM NULLIF(btrim(COALESCE(broker, '')), '');

-- 3) Unicidade real por (usuário, ticker, corretora) — NULL tratado como bucket próprio
CREATE UNIQUE INDEX IF NOT EXISTS holdings_user_ticker_broker_uidx
  ON public.holdings (user_id, ticker, (COALESCE(broker, '__SEM_CORRETORA__')));

-- 4) Índice de leitura para as consultas da carteira
CREATE INDEX IF NOT EXISTS holdings_user_ticker_idx
  ON public.holdings (user_id, ticker);

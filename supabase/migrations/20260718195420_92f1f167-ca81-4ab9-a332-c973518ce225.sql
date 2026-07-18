-- Enable Realtime on portfolio_snapshots for live UI updates
ALTER TABLE public.portfolio_snapshots REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_snapshots;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

-- Ensure pg_cron + pg_net available (Lovable Cloud usually has them)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
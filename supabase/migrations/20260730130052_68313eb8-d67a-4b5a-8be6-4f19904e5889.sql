-- 1) AI cache: remove leitura cruzada entre contas
DROP POLICY IF EXISTS "Authenticated users can read ai_cache" ON public.ai_cache;
REVOKE ALL ON public.ai_cache FROM anon, authenticated;
GRANT ALL ON public.ai_cache TO service_role;

-- 2) Defense-in-depth: nenhuma policy do projeto concede acesso a visitantes.
--    Remove privilégios de tabela do papel anon em todo o schema public.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','v','p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- 3) Caches/infra internos nunca devem ser tocados pelo cliente
REVOKE ALL ON public.http_cache FROM anon, authenticated;
GRANT ALL ON public.http_cache TO service_role;
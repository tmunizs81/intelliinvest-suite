-- Fix security: restrict get_user_email to only return caller's own email
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN _user_id = auth.uid() THEN (SELECT email FROM auth.users WHERE id = _user_id)
    ELSE NULL
  END
$$;

-- Fix security: remove user INSERT on audit_logs, only service_role should write
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;

-- Create service-role-only INSERT policy for audit_logs
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs
FOR INSERT
TO service_role
WITH CHECK (true);
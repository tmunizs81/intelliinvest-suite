CREATE POLICY "users update own failures"
  ON public.snapshot_refresh_failures
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
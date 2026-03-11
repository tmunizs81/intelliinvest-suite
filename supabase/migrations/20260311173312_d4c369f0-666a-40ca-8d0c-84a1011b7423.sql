-- Allow members to update their own membership (accept invite)
CREATE POLICY "Members can update their membership"
ON public.family_members
FOR UPDATE
TO authenticated
USING (member_id = auth.uid())
WITH CHECK (member_id = auth.uid());

-- Allow members to delete their membership (reject invite)
CREATE POLICY "Members can delete their membership"
ON public.family_members
FOR DELETE
TO authenticated
USING (member_id = auth.uid());

-- Allow reading family_members by invited_email match (for auto-linking)
-- We need a function to check email match since RLS can't easily access auth.users.email
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = _user_id
$$;

-- Allow users to see invites sent to their email
CREATE POLICY "Users can view invites for their email"
ON public.family_members
FOR SELECT
TO authenticated
USING (invited_email = public.get_user_email(auth.uid()));

-- Allow users to update invites for their email (to set member_id)
CREATE POLICY "Users can accept invites for their email"
ON public.family_members
FOR UPDATE
TO authenticated
USING (invited_email = public.get_user_email(auth.uid()))
WITH CHECK (invited_email = public.get_user_email(auth.uid()));

-- Trigger to prevent members from changing owner_id and invited_email on family_members
CREATE OR REPLACE FUNCTION public.protect_family_member_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only owner can change owner_id or invited_email
  -- For non-owners, force these fields to remain unchanged
  IF OLD.owner_id != auth.uid() THEN
    NEW.owner_id := OLD.owner_id;
    NEW.invited_email := OLD.invited_email;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_family_member_fields_trigger
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_family_member_fields();

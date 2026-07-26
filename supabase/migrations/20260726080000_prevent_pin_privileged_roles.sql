-- Phone+PIN accounts use a synthetic email (<phone>@customers.mytown.internal)
-- specifically to be low-friction for customers -- weaker identity
-- verification than a real email or Google account. Nothing should ever be
-- able to grant admin/ops to one of these, regardless of who runs the
-- INSERT or through what path -- this is enforced at the database level,
-- not just "nobody currently does this in the app code".
CREATE OR REPLACE FUNCTION public.mytown_prevent_pin_privileged_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ops') THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
    IF v_email LIKE '%@customers.mytown.internal' THEN
      RAISE EXCEPTION 'Phone+PIN accounts cannot be granted % role. Use a real email or Google account for staff access.', NEW.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_pin_privileged_role ON public.user_roles;
CREATE TRIGGER prevent_pin_privileged_role
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.mytown_prevent_pin_privileged_role();

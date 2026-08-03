REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mytown_prevent_pin_privileged_role() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mytown_prevent_pin_privileged_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
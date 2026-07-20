
REVOKE EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) TO service_role;


CREATE OR REPLACE FUNCTION public.mytown_verify_employee_pin(p_pin TEXT)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.name
  FROM public.employees e
  WHERE e.active = true
    AND e.pin_hash = crypt(p_pin, e.pin_hash)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mytown_verify_employee_pin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) TO service_role;

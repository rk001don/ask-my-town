
CREATE OR REPLACE FUNCTION public.mytown_new_order_id() RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  exists_count INT;
BEGIN
  LOOP
    candidate := 'MT-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.orders WHERE id = candidate;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN candidate;
END;
$$;

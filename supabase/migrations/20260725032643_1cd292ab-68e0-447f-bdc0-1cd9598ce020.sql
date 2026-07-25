CREATE OR REPLACE FUNCTION public.mytown_new_order_id()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  candidate TEXT;
  exists_count INT;
BEGIN
  LOOP
    candidate := 'MT-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    SELECT count(*) INTO exists_count FROM public.orders WHERE id = candidate;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN candidate;
END;
$function$;
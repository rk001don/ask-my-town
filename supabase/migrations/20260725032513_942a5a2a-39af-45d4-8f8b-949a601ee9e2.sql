DROP POLICY IF EXISTS "Customers: staff can read all" ON public.customers;
CREATE POLICY "Customers: admin/ops can read all" ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

DROP POLICY IF EXISTS "Orders: staff can read all" ON public.orders;
CREATE POLICY "Orders: admin/ops can read all" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

DROP POLICY IF EXISTS "Order items: staff can read all" ON public.order_items;
CREATE POLICY "Order items: admin/ops can read all" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

CREATE OR REPLACE FUNCTION public.mytown_warden_daily_counts(p_location_id UUID DEFAULT NULL)
RETURNS TABLE (delivery_date DATE, total_orders BIGINT, completed_orders BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops') OR public.has_role(auth.uid(), 'warden_viewer')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT o.requested_date, count(*)::BIGINT, count(*) FILTER (WHERE o.status = 'completed')::BIGINT
    FROM public.orders o
    WHERE (p_location_id IS NULL OR o.location_id = p_location_id)
      AND o.requested_date >= (CURRENT_DATE - INTERVAL '30 days')
    GROUP BY o.requested_date
    ORDER BY o.requested_date DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.mytown_warden_daily_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_warden_daily_counts(UUID) TO authenticated;

DROP POLICY IF EXISTS "Orders: staff can update status" ON public.orders;
CREATE POLICY "Orders: admin/ops can update status" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_idx ON public.rate_limit_hits (bucket, hit_at DESC);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mytown_check_rate_limit(p_bucket TEXT, p_max_hits INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.rate_limit_hits WHERE hit_at < now() - (p_window_seconds || ' seconds')::INTERVAL;
  SELECT count(*) INTO v_count FROM public.rate_limit_hits
    WHERE bucket = p_bucket AND hit_at > now() - (p_window_seconds || ' seconds')::INTERVAL;
  IF v_count >= p_max_hits THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limit_hits (bucket) VALUES (p_bucket);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mytown_check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_check_rate_limit(TEXT, INT, INT) TO service_role;

DROP POLICY IF EXISTS "ask-attachments: anyone can upload" ON storage.objects;
CREATE POLICY "ask-attachments: anyone can upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'ask-attachments');

DROP POLICY IF EXISTS "ask-attachments: admin/ops can read" ON storage.objects;
CREATE POLICY "ask-attachments: admin/ops can read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ask-attachments'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'))
  );

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
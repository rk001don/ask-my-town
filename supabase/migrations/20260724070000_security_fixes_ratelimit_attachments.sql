-- ============================================================================
-- Fixes from the security/functional bug audit:
-- 1) warden_viewer must not read customer/order PII — role-specific RLS
-- 2) order status UPDATE must be admin/ops only, not any staff role
-- 4) (schema support) nothing needed here, fixed in application code
-- 9) basic rate limiting table for createOrder
-- 7) attachments storage bucket
-- ============================================================================

-- -----------------------------------------------------------------
-- 1) Replace blanket "staff can read all" policies with role-specific ones
-- -----------------------------------------------------------------
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

-- warden_viewer gets a dedicated aggregate-only RPC instead of table access.
-- SECURITY DEFINER so it can read across all orders internally while only ever
-- returning counts — a warden_viewer account has NO RLS grant on customers/orders at all.
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

-- -----------------------------------------------------------------
-- 2) Order status UPDATE restricted to admin/ops at the RLS layer, not any staff role
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Orders: staff can update status" ON public.orders;
CREATE POLICY "Orders: admin/ops can update status" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

-- -----------------------------------------------------------------
-- 9) Minimal DB-backed rate limiting for createOrder (and reusable elsewhere)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket TEXT NOT NULL,        -- e.g. 'create_order:<phone-or-fingerprint>'
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_idx ON public.rate_limit_hits (bucket, hit_at DESC);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No client policy at all: only service_role (server functions) may touch this table.

CREATE OR REPLACE FUNCTION public.mytown_check_rate_limit(p_bucket TEXT, p_max_hits INT, p_window_seconds INT)
RETURNS BOOLEAN  -- true = allowed, false = rate-limited
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

-- -----------------------------------------------------------------
-- 7) Attachments: bucket + policies (idempotent-ish; Storage buckets are created via API
--    normally, but this covers projects where SQL bucket creation is enabled)
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ask-attachments', 'ask-attachments', false)
ON CONFLICT (id) DO NOTHING;

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

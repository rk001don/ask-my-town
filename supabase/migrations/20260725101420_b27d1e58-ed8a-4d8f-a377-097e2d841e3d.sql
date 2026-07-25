
-- 1. Tighten order_items insert: require the referenced order to be very recent and still 'received'
DROP POLICY IF EXISTS insert_order_items_anyone ON public.order_items;
CREATE POLICY insert_order_items_anyone ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(item_name)) BETWEEN 1 AND 160
    AND quantity BETWEEN 1 AND 50
    AND (notes IS NULL OR length(notes) <= 280)
    AND (category IS NULL OR length(category) <= 80)
    AND (subcategory IS NULL OR length(subcategory) <= 80)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.status = 'received'
        AND o.created_at > now() - interval '15 minutes'
    )
  );

-- 2. Tighten order_attachments insert: same ownership window via linked order
DROP POLICY IF EXISTS insert_attachment_anyone ON public.order_attachments;
CREATE POLICY insert_attachment_anyone ON public.order_attachments
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(file_path) <= 400
    AND length(file_type) <= 60
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = order_attachments.order_item_id
        AND o.status = 'received'
        AND o.created_at > now() - interval '15 minutes'
    )
  );

-- 3. app_config: scope public reads to explicitly-public rows
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
-- Preserve existing behavior: whatever's already there was public-readable, keep it that way
UPDATE public.app_config SET is_public = true WHERE is_public = false;
DROP POLICY IF EXISTS public_read_config ON public.app_config;
CREATE POLICY public_read_config ON public.app_config
  FOR SELECT TO anon, authenticated
  USING (is_public = true);

-- 4. Lock down SECURITY DEFINER functions that should only run server-side (called via service_role)
REVOKE EXECUTE ON FUNCTION public.mytown_new_order_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.mytown_verify_employee_pin(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.mytown_check_rate_limit(text, integer, integer) FROM anon, authenticated, public;
-- warden_daily_counts stays callable by signed-in users (server fn runs as authenticated); revoke anon only
REVOKE EXECUTE ON FUNCTION public.mytown_warden_daily_counts(uuid) FROM anon, public;

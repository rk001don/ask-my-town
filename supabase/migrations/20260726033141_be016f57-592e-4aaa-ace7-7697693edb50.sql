
-- Drop client-facing INSERT policies; server functions use service_role which bypasses RLS.
DROP POLICY IF EXISTS insert_order_items_anyone ON public.order_items;
DROP POLICY IF EXISTS insert_attachment_anyone ON public.order_attachments;

-- Revoke unused EXECUTE grants on SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mytown_warden_daily_counts(uuid) FROM authenticated;

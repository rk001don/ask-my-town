-- Catalog images
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Service fee tiers + per-order snapshot
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee_estimate NUMERIC(10,2);

INSERT INTO public.app_config (key, value, description, is_public) VALUES
('service_fee_tiers',
 '{"tiers":[{"max_subtotal":199,"fee":19},{"max_subtotal":499,"fee":39},{"max_subtotal":999,"fee":59}],"default_fee":99}'::jsonb,
 'Service fee by estimated basket subtotal: fee applies for subtotal <= max_subtotal (first match wins), default_fee otherwise.',
 true
) ON CONFLICT (key, scope, scope_id) DO NOTHING;

-- Staff can read order attachments
DROP POLICY IF EXISTS "Order attachments: admin/ops can read" ON public.order_attachments;
CREATE POLICY "Order attachments: admin/ops can read" ON public.order_attachments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

GRANT SELECT ON public.order_attachments TO authenticated;

-- Phone+PIN accounts must never hold admin/ops
CREATE OR REPLACE FUNCTION public.mytown_prevent_pin_privileged_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NEW.role IN ('admin', 'ops') THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
    IF v_email LIKE '%@customers.mytown.internal' THEN
      RAISE EXCEPTION 'Phone+PIN accounts cannot be granted % role.', NEW.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_pin_privileged_role ON public.user_roles;
CREATE TRIGGER prevent_pin_privileged_role
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.mytown_prevent_pin_privileged_role();

-- Delivery windows
UPDATE public.locations
SET config = jsonb_set(
  config,
  '{delivery_windows}',
  '[
    {"label": "Morning",   "start": "07:00", "end": "11:00", "cutoff": "06:30"},
    {"label": "Afternoon", "start": "12:00", "end": "17:00", "cutoff": "11:30"},
    {"label": "Dinner",    "start": "18:00", "end": "22:00", "cutoff": "17:30"}
  ]'::jsonb
)
WHERE config ? 'delivery_windows';
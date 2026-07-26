-- Configurable service-fee tiers (config over code, same pattern as every
-- other app_config row) and a per-order snapshot so a later tier change
-- never retroactively alters what a past order is shown to have cost.

INSERT INTO public.app_config (key, value, description) VALUES
('service_fee_tiers',
 '{"tiers":[{"max_subtotal":199,"fee":19},{"max_subtotal":499,"fee":39},{"max_subtotal":999,"fee":59}],"default_fee":99}'::jsonb,
 'Service fee by estimated basket subtotal: fee applies for subtotal <= max_subtotal (first match wins), default_fee otherwise. Edit the JSON directly to change pricing tiers -- no deploy needed.'
) ON CONFLICT (key, scope, scope_id) DO NOTHING;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee_estimate NUMERIC(10,2);

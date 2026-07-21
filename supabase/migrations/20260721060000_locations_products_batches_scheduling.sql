-- ============================================================================
-- MyTown v2 migration
-- Scope: locations, real product catalog, delivery batches, riders, staff,
--        app_config, audit_log, order_attachments, group_orders, and the
--        "schedule order up to 2 days ahead" feature.
-- Explicitly OUT of scope for this migration: wallets, wallet_transactions,
--        payments (Razorpay), subscriptions. Payment stays COD/"confirm on
--        WhatsApp" exactly as it is today. See project notes for rationale.
-- ============================================================================

-- ============================================================
-- locations
-- ============================================================
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_language TEXT NOT NULL DEFAULT 'ta',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  -- config JSONB shape: { delivery_windows: [{label, start, end, cutoff}], handoff_policy: 'gate'|'room', gate_contact, currency }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_locations ON public.locations FOR SELECT TO anon, authenticated USING (active = true);

INSERT INTO public.locations (name, slug, default_language, config) VALUES (
  'Karimangalam', 'karimangalam', 'ta',
  '{
    "delivery_windows": [
      {"label": "morning", "start": "07:00", "end": "09:30", "cutoff": "06:30"},
      {"label": "evening", "start": "17:00", "end": "19:30", "cutoff": "16:00"},
      {"label": "night",   "start": "21:00", "end": "23:00", "cutoff": "20:00"}
    ],
    "handoff_policy": "gate",
    "gate_contact": null,
    "currency": "INR"
  }'::jsonb
);

-- ============================================================
-- products (real catalog with configurable price/payment/service/schedulable flags)
-- ============================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE, -- NULL = available at all locations
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(10,2),                          -- NULL = no fixed price (bespoke/arranged)
  currency TEXT NOT NULL DEFAULT 'INR',
  show_price BOOLEAN NOT NULL DEFAULT true,      -- configurable per product
  payment_mode TEXT NOT NULL DEFAULT 'cod_only'  -- reserved for future use; not enforced this phase
    CHECK (payment_mode IN ('cod_only','online_only','both')),
  is_veg BOOLEAN,
  is_service BOOLEAN NOT NULL DEFAULT false,     -- true hides quantity stepper (e.g. "plumber visit")
  schedulable BOOLEAN NOT NULL DEFAULT true,     -- false = must be ordered ASAP, cannot schedule ahead
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',             -- e.g. {'tier1','festival'}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (show_price = false OR price IS NOT NULL) -- can't show a price that doesn't exist
);
CREATE INDEX products_category_idx ON public.products (category_id, sort_order);
CREATE INDEX products_location_idx ON public.products (location_id);
CREATE INDEX products_tags_idx ON public.products USING GIN (tags);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_products ON public.products FOR SELECT TO anon, authenticated USING (is_available = true);

-- Seed a first slice of real, priced Tier-1 items against existing category slugs
-- (food-home, food-tiffin, food-restaurant already exist from the original seed).
DO $$
DECLARE
  home_cat UUID; tiffin_cat UUID; restaurant_cat UUID;
BEGIN
  SELECT id INTO home_cat FROM public.categories WHERE slug = 'food-home';
  SELECT id INTO tiffin_cat FROM public.categories WHERE slug = 'food-tiffin';
  SELECT id INTO restaurant_cat FROM public.categories WHERE slug = 'food-restaurant';

  INSERT INTO public.products (category_id, name, price, show_price, is_veg, sort_order, tags) VALUES
    (tiffin_cat, 'Idly (4 pcs)', 30, true, true, 1, '{"tier1"}'),
    (tiffin_cat, 'Dosa (plain)', 35, true, true, 2, '{"tier1"}'),
    (tiffin_cat, 'Dosa (masala)', 45, true, true, 3, '{"tier1"}'),
    (tiffin_cat, 'Pongal', 35, true, true, 4, '{"tier1"}'),
    (tiffin_cat, 'Upma', 30, true, true, 5, '{"tier1"}'),
    (home_cat, 'Curd rice (box)', 40, true, true, 1, '{"tier1"}'),
    (home_cat, 'Veg thali', 70, true, true, 2, '{"tier1"}'),
    (home_cat, 'Non-veg thali', 100, true, false, 3, '{"tier1"}'),
    (restaurant_cat, 'Chicken biryani', 130, true, false, 1, '{"tier1"}'),
    (restaurant_cat, 'Mutton biryani', 180, true, false, 2, '{"tier1"}'),
    (restaurant_cat, 'Chettinad chicken (half)', 150, true, false, 3, '{"tier1"}'),
    (restaurant_cat, 'Parotta (2 pcs)', 25, true, true, 4, '{"tier1"}');
END $$;

-- ============================================================
-- delivery_batches (shift-window batching per location, supports future dates)
-- ============================================================
CREATE TABLE public.delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  window_label TEXT NOT NULL,          -- must match a label in locations.config.delivery_windows
  batch_date DATE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','dispatched','delivered','cancelled')),
  rider_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, window_label, batch_date)
);
CREATE INDEX delivery_batches_open_idx ON public.delivery_batches (location_id, status, batch_date);
GRANT ALL ON public.delivery_batches TO service_role;
ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- riders (verified delivery staff — shown to customer for trust)
-- ============================================================
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  photo_url TEXT,
  id_proof_url TEXT,                  -- staff-only visibility, never exposed to customer queries
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
-- No public policy — rider name/photo exposed to customer only via a server function
-- that strips id_proof_url before returning, never a direct table read.

ALTER TABLE public.delivery_batches
  ADD CONSTRAINT delivery_batches_rider_fkey FOREIGN KEY (rider_id) REFERENCES public.riders(id);

-- ============================================================
-- staff (replaces shared PIN with real per-person accounts)
-- ============================================================
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','ops','warden_viewer')),
  location_id UUID REFERENCES public.locations(id), -- NULL = access to all locations (admin)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read_self ON public.staff FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- app_config (generic config-driven feature flags — global/location/category scoped)
-- ============================================================
CREATE TABLE public.app_config (
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','location','category')),
  scope_id UUID,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, scope, scope_id)
);
GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_config ON public.app_config FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_config (key, scope, scope_id, value, description) VALUES
  ('show_price_default', 'global', NULL, 'true', 'Default show_price for newly added products'),
  ('max_schedule_days_ahead', 'global', NULL, '2', 'How many days ahead a customer can schedule an order');

-- ============================================================
-- audit_log (accountability for staff actions)
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_type, entity_id, created_at DESC);
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- order_attachments (optional photo on a freeform ask / medicine order)
-- ============================================================
CREATE TABLE public.order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_attachments TO anon, authenticated;
GRANT ALL ON public.order_attachments TO service_role;
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY insert_attachment_anyone ON public.order_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================
-- group_orders (floor/room-level shared cart)
-- ============================================================
CREATE TABLE public.group_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  initiator_customer_id UUID NOT NULL REFERENCES public.customers(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','placed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.group_orders TO service_role;
ALTER TABLE public.group_orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Auth linkage: customers <-> auth.users
-- ============================================================
ALTER TABLE public.customers ADD COLUMN user_id UUID REFERENCES auth.users(id);
CREATE INDEX customers_user_idx ON public.customers (user_id);

-- ============================================================
-- orders: location/batch/group linkage + scheduling
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN location_id UUID REFERENCES public.locations(id),
  ADD COLUMN delivery_batch_id UUID REFERENCES public.delivery_batches(id),
  ADD COLUMN group_order_id UUID REFERENCES public.group_orders(id),
  ADD COLUMN requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN requested_window TEXT,
  ADD CONSTRAINT orders_requested_date_range
    CHECK (requested_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2);

CREATE POLICY customer_read_own_orders ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

CREATE POLICY customer_read_own_order_items ON public.order_items
  FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE c.user_id = auth.uid()
  ));

ALTER TABLE public.order_items ADD COLUMN product_id UUID REFERENCES public.products(id);

-- ============================================================
-- Server-side helper: resolve or create the correct delivery batch
-- for a given location/window/date. Called from the createOrder
-- server function (service_role context), not directly by clients.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mytown_get_or_create_batch(
  p_location_id UUID, p_window_label TEXT, p_batch_date DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_window JSONB;
  v_scheduled_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_batch_id FROM public.delivery_batches
    WHERE location_id = p_location_id AND window_label = p_window_label AND batch_date = p_batch_date;
  IF v_batch_id IS NOT NULL THEN
    RETURN v_batch_id;
  END IF;

  SELECT w INTO v_window FROM public.locations l,
    LATERAL jsonb_array_elements(l.config->'delivery_windows') w
    WHERE l.id = p_location_id AND w->>'label' = p_window_label;

  v_scheduled_at := (p_batch_date::TEXT || ' ' || COALESCE(v_window->>'start', '12:00'))::TIMESTAMPTZ;

  INSERT INTO public.delivery_batches (location_id, window_label, batch_date, scheduled_at)
  VALUES (p_location_id, p_window_label, p_batch_date, v_scheduled_at)
  RETURNING id INTO v_batch_id;

  RETURN v_batch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mytown_get_or_create_batch(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_get_or_create_batch(UUID, TEXT, DATE) TO service_role;

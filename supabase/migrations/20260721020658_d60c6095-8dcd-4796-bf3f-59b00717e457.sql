
-- LOCATIONS
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_language TEXT NOT NULL DEFAULT 'ta',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_locations ON public.locations FOR SELECT TO anon, authenticated USING (active = true);

INSERT INTO public.locations (name, slug, default_language, timezone, config) VALUES
('Karimangalam', 'karimangalam', 'ta', 'Asia/Kolkata',
  '{
    "delivery_windows": [
      {"label":"Morning","start":"07:00","end":"11:00","cutoff":"09:30"},
      {"label":"Evening","start":"15:00","end":"19:00","cutoff":"16:30"},
      {"label":"Night",  "start":"19:00","end":"22:00","cutoff":"20:30"}
    ],
    "handoff_policy":"gate",
    "currency":"INR"
  }'::jsonb);

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'INR',
  show_price BOOLEAN NOT NULL DEFAULT true,
  payment_mode TEXT NOT NULL DEFAULT 'both' CHECK (payment_mode IN ('cod_only','online_only','both')),
  is_veg BOOLEAN,
  is_service BOOLEAN NOT NULL DEFAULT false,
  is_subscription_eligible BOOLEAN NOT NULL DEFAULT false,
  is_available BOOLEAN NOT NULL DEFAULT true,
  schedulable BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (show_price = false OR price IS NOT NULL)
);
CREATE INDEX products_category_idx ON public.products (category_id, sort_order);
CREATE INDEX products_location_idx ON public.products (location_id);
CREATE INDEX products_tags_idx ON public.products USING GIN (tags);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_products ON public.products FOR SELECT TO anon, authenticated USING (is_available = true);

INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order) VALUES
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Home-style Veg Meals', 'Rice, sambar, rasam, poriyal, curd', 90, true, false, true, 1),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Chicken Biryani', 'Fresh, packed hot', 180, true, false, true, 2),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Idli Sambar (4 pcs)', 'Breakfast pack', 50, true, false, true, 3),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Amul Milk 500ml', 'Toned milk', 30, true, false, true, 1),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Sugar 1kg', NULL, 48, true, false, true, 2),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Fresh Vegetables Basket', 'Curated seasonal veg', 250, true, false, true, 3),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Paracetamol 500mg strip', 'General use', 25, true, false, false, 4),
((SELECT id FROM public.categories WHERE slug='beauty' AND parent_id IS NULL), 'Salon Haircut (at home)', NULL, 200, true, true, true, 1),
((SELECT id FROM public.categories WHERE slug='beauty' AND parent_id IS NULL), 'Threading', NULL, 60, true, true, true, 2),
((SELECT id FROM public.categories WHERE slug='travel' AND parent_id IS NULL), 'Bus Ticket Booking Help', 'We help book, you pay ticket cost', NULL, false, true, true, 1),
((SELECT id FROM public.categories WHERE slug='travel' AND parent_id IS NULL), 'Local Cab (1-way)', 'Within 15km', 300, true, true, true, 2),
((SELECT id FROM public.categories WHERE slug='stay' AND parent_id IS NULL), 'House Cleaning (2 hr)', NULL, 350, true, true, true, 1),
((SELECT id FROM public.categories WHERE slug='stay' AND parent_id IS NULL), 'Cook (per meal)', NULL, 150, true, true, true, 2),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Plumber Visit', 'Basic visit; parts extra', 200, true, true, false, 1),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Electrician Visit', 'Basic visit; parts extra', 200, true, true, false, 2),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'AC Service', NULL, 500, true, true, true, 3),
((SELECT id FROM public.categories WHERE slug='rentals' AND parent_id IS NULL), 'Bike Rental (per day)', 'ID proof required', 400, true, true, true, 1),
((SELECT id FROM public.categories WHERE slug='rentals' AND parent_id IS NULL), 'Car Rental (per day)', 'Driver optional', 1800, true, true, true, 2),
((SELECT id FROM public.categories WHERE slug='rentals' AND parent_id IS NULL), 'Event Chairs (10 pcs)', 'Per day', 200, true, true, true, 3);

-- STAFF
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','ops','warden_viewer')),
  location_id UUID REFERENCES public.locations(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read_self ON public.staff FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RIDERS
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  photo_url TEXT,
  id_proof_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

-- DELIVERY BATCHES
CREATE TABLE public.delivery_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  window_label TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','dispatched','delivered','cancelled')),
  rider_id UUID REFERENCES public.riders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX delivery_batches_unique_idx ON public.delivery_batches (location_id, window_label, scheduled_date);
CREATE INDEX delivery_batches_open_idx ON public.delivery_batches (location_id, status, scheduled_at);
GRANT SELECT ON public.delivery_batches TO authenticated;
GRANT ALL ON public.delivery_batches TO service_role;
ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY;

-- APP CONFIG (nil UUID sentinel for global scope)
CREATE TABLE public.app_config (
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','location','category')),
  scope_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (key, scope, scope_id)
);
GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_config ON public.app_config FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_config (key, value, description) VALUES
('languages_enabled','["ta","en"]'::jsonb,'UI language toggles');

-- AUDIT LOG
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

-- ORDER ATTACHMENTS
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
CREATE POLICY insert_attachment_anyone ON public.order_attachments FOR INSERT TO anon, authenticated WITH CHECK (length(file_path) <= 400 AND length(file_type) <= 60);

-- GROUP ORDERS
CREATE TABLE public.group_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  initiator_customer_id UUID NOT NULL REFERENCES public.customers(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','placed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.group_orders TO service_role;
ALTER TABLE public.group_orders ENABLE ROW LEVEL SECURITY;

-- ALTER EXISTING TABLES
ALTER TABLE public.customers ADD COLUMN user_id UUID REFERENCES auth.users(id);
CREATE INDEX customers_user_idx ON public.customers (user_id);

ALTER TABLE public.orders
  ADD COLUMN location_id UUID REFERENCES public.locations(id),
  ADD COLUMN delivery_batch_id UUID REFERENCES public.delivery_batches(id),
  ADD COLUMN group_order_id UUID REFERENCES public.group_orders(id),
  ADD COLUMN subscription_id UUID,
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','paid','cod','refunded')),
  ADD COLUMN wallet_amount_used NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN requested_window TEXT,
  ADD CONSTRAINT orders_requested_date_range
    CHECK (requested_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2);

CREATE INDEX orders_requested_date_idx ON public.orders (requested_date, requested_window);
CREATE INDEX orders_batch_idx ON public.orders (delivery_batch_id);

DROP POLICY IF EXISTS "insert_orders_anyone" ON public.orders;
CREATE POLICY "insert_orders_anyone" ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'received'
    AND assigned_employee_id IS NULL
    AND confirmed_at IS NULL
    AND completed_at IS NULL
    AND customer_id IS NOT NULL
    AND (notes IS NULL OR length(notes) <= 500)
    AND requested_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
    AND (requested_window IS NULL OR length(requested_window) <= 40)
    AND payment_status IN ('unpaid','cod','pending')
    AND wallet_amount_used = 0
    AND subscription_id IS NULL
    AND delivery_batch_id IS NULL
    AND group_order_id IS NULL
  );

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
CREATE INDEX order_items_product_idx ON public.order_items (product_id);

DROP POLICY IF EXISTS "insert_order_items_anyone" ON public.order_items;
CREATE POLICY "insert_order_items_anyone" ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(item_name)) >= 1 AND length(btrim(item_name)) <= 160
    AND quantity >= 1 AND quantity <= 50
    AND (notes IS NULL OR length(notes) <= 280)
    AND (category IS NULL OR length(category) <= 80)
    AND (subcategory IS NULL OR length(subcategory) <= 80)
  );

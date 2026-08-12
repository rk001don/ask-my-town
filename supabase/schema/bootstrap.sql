-- Consolidated bootstrap schema for ask-my-town
-- Generated from supabase/migrations/*.sql, replayed in original order, on 2026-08-12.
-- Run this ONCE against a fresh/empty Supabase project via the SQL Editor.
-- Do NOT run this against a database that already has these migrations applied.

-- ====================================================================
-- Source: 20260720052016_3201f5ce-5337-4276-b876-a1b99f44cb7b.sql
-- ====================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Order status enum
CREATE TYPE public.order_status AS ENUM ('received','confirmed','arranging','on_the_way','completed','cancelled');

-- ============================================================================
-- customers
-- ============================================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  landmark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_phone_idx ON public.customers (phone);
GRANT SELECT, INSERT ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
-- Reads happen through server functions using service_role; block direct anon reads (no policy = deny).
CREATE POLICY "insert_customers_anyone" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================================
-- orders (short human ID like MT-XXXXXX)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mytown_new_order_id() RETURNS TEXT
LANGUAGE plpgsql AS $$
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

CREATE TABLE public.orders (
  id TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status public.order_status NOT NULL DEFAULT 'received',
  notes TEXT,
  assigned_employee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON public.orders (status);
CREATE INDEX orders_customer_idx ON public.orders (customer_id);
CREATE INDEX orders_created_idx ON public.orders (created_at DESC);
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_orders_anyone" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
-- No SELECT/UPDATE policies for anon — reads/updates go through server functions using service_role.

-- ============================================================================
-- order_items
-- ============================================================================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT,
  is_freeform BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_order_items_anyone" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================================
-- employees
-- ============================================================================
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Employees table is server-only (accessed via service_role in server functions).
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
-- No policies = anon/authenticated cannot read/write directly.

-- ============================================================================
-- categories (public read)
-- ============================================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  icon_key TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX categories_parent_idx ON public.categories (parent_id, sort_order);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_categories" ON public.categories FOR SELECT TO anon, authenticated USING (true);

-- ============================================================================
-- search_analytics
-- ============================================================================
CREATE TABLE public.search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX search_analytics_term_idx ON public.search_analytics (normalized_term);
GRANT INSERT ON public.search_analytics TO anon, authenticated;
GRANT ALL ON public.search_analytics TO service_role;
ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_search_anyone" ON public.search_analytics FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================================
-- Seed: employees (default PIN 482571 — bcrypt via pgcrypto)
-- ============================================================================
INSERT INTO public.employees (name, pin_hash, active)
VALUES ('MyTown Ops', crypt('482571', gen_salt('bf', 10)), true);

-- ============================================================================
-- Seed: categories (7 top-level with subcategories/items per §6)
-- ============================================================================
DO $$
DECLARE
  cat_id UUID;
BEGIN
  -- Food & Home Meals
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Food & Home Meals','food','utensils',1) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Home-cooked meals', 'food-home', cat_id, 'chef-hat', 1),
    ('Breakfast tiffin',  'food-tiffin', cat_id, 'coffee', 2),
    ('Lunch box',         'food-lunch', cat_id, 'utensils-crossed', 3),
    ('Snacks & sweets',   'food-snacks', cat_id, 'cookie', 4),
    ('Restaurant pickup', 'food-restaurant', cat_id, 'store', 5),
    ('Fresh juice',       'food-juice', cat_id, 'glass-water', 6);

  -- Daily Needs
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Daily Needs','daily','shopping-basket',2) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Groceries',        'daily-groceries', cat_id, 'shopping-cart', 1),
    ('Fruits & veggies', 'daily-produce', cat_id, 'apple', 2),
    ('Dairy & bakery',   'daily-dairy', cat_id, 'milk', 3),
    ('Medicines',        'daily-medicines', cat_id, 'pill', 4),
    ('Household supplies','daily-household', cat_id, 'spray-can', 5),
    ('Stationery',       'daily-stationery', cat_id, 'pencil', 6);

  -- Beauty & Personal Care
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Beauty & Personal Care','beauty','sparkles',3) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Salon at home',    'beauty-salon', cat_id, 'scissors', 1),
    ('Skincare pickup',  'beauty-skin', cat_id, 'droplet', 2),
    ('Haircare',         'beauty-hair', cat_id, 'wind', 3),
    ('Makeup essentials','beauty-makeup', cat_id, 'palette', 4),
    ('Grooming for men', 'beauty-men', cat_id, 'user', 5);

  -- Travel & Tickets
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Travel & Tickets','travel','plane',4) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Bus tickets',      'travel-bus', cat_id, 'bus', 1),
    ('Train tickets',    'travel-train', cat_id, 'train', 2),
    ('Flight booking',   'travel-flight', cat_id, 'plane', 3),
    ('Cab booking',      'travel-cab', cat_id, 'car', 4),
    ('Movie tickets',    'travel-movie', cat_id, 'film', 5),
    ('Event tickets',    'travel-event', cat_id, 'ticket', 6);

  -- Stay & Local Help
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Stay & Local Help','stay','home',5) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Hotel booking',    'stay-hotel', cat_id, 'bed', 1),
    ('House cleaning',   'stay-cleaning', cat_id, 'sparkle', 2),
    ('Cook at home',     'stay-cook', cat_id, 'utensils', 3),
    ('Elder care visit', 'stay-elder', cat_id, 'heart-handshake', 4),
    ('Pet care',         'stay-pet', cat_id, 'paw-print', 5);

  -- Local Services
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Local Services','services','wrench',6) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Plumber',       'svc-plumber', cat_id, 'droplets', 1),
    ('Electrician',   'svc-electrician', cat_id, 'zap', 2),
    ('Carpenter',     'svc-carpenter', cat_id, 'hammer', 3),
    ('AC service',    'svc-ac', cat_id, 'snowflake', 4),
    ('Laundry pickup','svc-laundry', cat_id, 'shirt', 5),
    ('Courier drop',  'svc-courier', cat_id, 'package', 6);

  -- Rentals
  INSERT INTO public.categories (name, slug, icon_key, sort_order) VALUES ('Rentals','rentals','key-round',7) RETURNING id INTO cat_id;
  INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order) VALUES
    ('Two-wheeler',    'rent-bike', cat_id, 'bike', 1),
    ('Car',            'rent-car', cat_id, 'car-front', 2),
    ('Cycle',          'rent-cycle', cat_id, 'bike', 3),
    ('Party supplies', 'rent-party', cat_id, 'party-popper', 4),
    ('Camera gear',    'rent-camera', cat_id, 'camera', 5);
END $$;

-- ====================================================================
-- Source: 20260720052044_dadf6a83-9e68-44f6-9aad-0b3fe0c114b4.sql
-- ====================================================================

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

-- ====================================================================
-- Source: 20260720052307_9f8fa970-7ecb-46a8-8684-75c07a0bf295.sql
-- ====================================================================

CREATE OR REPLACE FUNCTION public.mytown_verify_employee_pin(p_pin TEXT)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.name
  FROM public.employees e
  WHERE e.active = true
    AND e.pin_hash = crypt(p_pin, e.pin_hash)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mytown_verify_employee_pin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) TO service_role;

-- ====================================================================
-- Source: 20260720052329_8b803597-9912-43a3-ab6f-44ccde62c0b4.sql
-- ====================================================================

REVOKE EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mytown_verify_employee_pin(TEXT) TO service_role;

-- ====================================================================
-- Source: 20260720055335_b2c3e171-ac54-4301-a6ad-1276ff0fd92b.sql
-- ====================================================================

-- Tighten permissive INSERT policies with data-shape WITH CHECK constraints
DROP POLICY IF EXISTS insert_customers_anyone ON public.customers;
CREATE POLICY insert_customers_anyone ON public.customers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(name)) BETWEEN 2 AND 80
    AND length(btrim(phone)) BETWEEN 7 AND 20
    AND length(btrim(address)) BETWEEN 6 AND 400
    AND (landmark IS NULL OR length(landmark) <= 120)
  );

DROP POLICY IF EXISTS insert_orders_anyone ON public.orders;
CREATE POLICY insert_orders_anyone ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'received'::order_status
    AND assigned_employee_id IS NULL
    AND confirmed_at IS NULL
    AND completed_at IS NULL
    AND customer_id IS NOT NULL
    AND (notes IS NULL OR length(notes) <= 500)
  );

DROP POLICY IF EXISTS insert_order_items_anyone ON public.order_items;
CREATE POLICY insert_order_items_anyone ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(item_name)) BETWEEN 1 AND 160
    AND quantity BETWEEN 1 AND 50
    AND (notes IS NULL OR length(notes) <= 280)
    AND (category IS NULL OR length(category) <= 80)
    AND (subcategory IS NULL OR length(subcategory) <= 80)
  );

DROP POLICY IF EXISTS insert_search_anyone ON public.search_analytics;
CREATE POLICY insert_search_anyone ON public.search_analytics
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(term) BETWEEN 1 AND 120
    AND length(normalized_term) BETWEEN 1 AND 120
    AND result_count >= 0
  );

-- ====================================================================
-- Source: 20260721020658_d60c6095-8dcd-4796-bf3f-59b00717e457.sql
-- ====================================================================

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

-- ====================================================================
-- Source: 20260723182519_346f5fb3-7a9a-4de0-8b08-c1231aeb6f83.sql
-- ====================================================================

-- =============================================================================
-- Phase 2 + 3 foundation: roles, user-scoped access for customers/orders, staff via Supabase Auth
-- =============================================================================

-- 1) Roles enum + user_roles table + has_role() helper
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'ops', 'warden_viewer', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','ops','warden_viewer')
  );
$$;

-- 2) customers.user_id owner-read
-- (column already exists per plan). Add owner SELECT + owner UPDATE (for address/name upkeep).
DROP POLICY IF EXISTS "Customers: owner can read own row" ON public.customers;
CREATE POLICY "Customers: owner can read own row" ON public.customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers: owner can update own row" ON public.customers;
CREATE POLICY "Customers: owner can update own row" ON public.customers
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Customers: staff can read all" ON public.customers;
CREATE POLICY "Customers: staff can read all" ON public.customers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 3) orders owner-read + staff read/update
DROP POLICY IF EXISTS "Orders: owner can read own via customer link" ON public.orders;
CREATE POLICY "Orders: owner can read own via customer link" ON public.orders
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.customers c WHERE c.id = orders.customer_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Orders: staff can read all" ON public.orders;
CREATE POLICY "Orders: staff can read all" ON public.orders
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Orders: staff can update status" ON public.orders;
CREATE POLICY "Orders: staff can update status" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4) order_items owner-read + staff read
DROP POLICY IF EXISTS "Order items: owner can read via order/customer link" ON public.order_items;
CREATE POLICY "Order items: owner can read via order/customer link" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.customers c ON c.id = o.customer_id
      WHERE o.id = order_items.order_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Order items: staff can read all" ON public.order_items;
CREATE POLICY "Order items: staff can read all" ON public.order_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ====================================================================
-- Source: 20260724070000_security_fixes_ratelimit_attachments.sql
-- ====================================================================
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

-- ====================================================================
-- Source: 20260724090000_order_items_price_snapshot.sql
-- ====================================================================
-- order_items needs to snapshot the price actually charged at order time.
-- Without this, editing a product's price later in /admin would make every
-- past order's displayed price silently drift from what was actually paid.
-- Historical order data must never depend on today's live product price.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);

-- ====================================================================
-- Source: 20260725032513_942a5a2a-39af-45d4-8f8b-949a601ee9e2.sql
-- ====================================================================
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
-- ====================================================================
-- Source: 20260725032643_1cd292ab-68e0-447f-bdc0-1cd9598ce020.sql
-- ====================================================================
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
-- ====================================================================
-- Source: 20260725101420_b27d1e58-ed8a-4d8f-a377-097e2d841e3d.sql
-- ====================================================================

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

-- ====================================================================
-- Source: 20260726032741_00dbdd4f-d656-465c-ac10-6e63663926da.sql
-- ====================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee_estimate numeric;
-- ====================================================================
-- Source: 20260726033141_be016f57-592e-4aaa-ace7-7697693edb50.sql
-- ====================================================================

-- Drop client-facing INSERT policies; server functions use service_role which bypasses RLS.
DROP POLICY IF EXISTS insert_order_items_anyone ON public.order_items;
DROP POLICY IF EXISTS insert_attachment_anyone ON public.order_attachments;

-- Revoke unused EXECUTE grants on SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mytown_warden_daily_counts(uuid) FROM authenticated;

-- ====================================================================
-- Source: 20260726060000_service_fee_tiers.sql
-- ====================================================================
-- Configurable service-fee tiers (config over code, same pattern as every
-- other app_config row) and a per-order snapshot so a later tier change
-- never retroactively alters what a past order is shown to have cost.

INSERT INTO public.app_config (key, value, description) VALUES
('service_fee_tiers',
 '{"tiers":[{"max_subtotal":199,"fee":19},{"max_subtotal":499,"fee":39},{"max_subtotal":999,"fee":59}],"default_fee":99}'::jsonb,
 'Service fee by estimated basket subtotal: fee applies for subtotal <= max_subtotal (first match wins), default_fee otherwise. Edit the JSON directly to change pricing tiers -- no deploy needed.'
) ON CONFLICT (key, scope, scope_id) DO NOTHING;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee_estimate NUMERIC(10,2);

-- ====================================================================
-- Source: 20260726070000_order_attachments_select_policy.sql
-- ====================================================================
-- order_attachments had an INSERT policy but no SELECT policy at all, so
-- even admin/ops staff (using the RLS-scoped client, not service_role)
-- could never read a single row -- this is the actual root cause of
-- uploaded attachment photos never appearing on the staff order dashboard.
CREATE POLICY "Order attachments: admin/ops can read" ON public.order_attachments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

-- ====================================================================
-- Source: 20260726080000_prevent_pin_privileged_roles.sql
-- ====================================================================
-- Phone+PIN accounts use a synthetic email (<phone>@customers.mytown.internal)
-- specifically to be low-friction for customers -- weaker identity
-- verification than a real email or Google account. Nothing should ever be
-- able to grant admin/ops to one of these, regardless of who runs the
-- INSERT or through what path -- this is enforced at the database level,
-- not just "nobody currently does this in the app code".
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
      RAISE EXCEPTION 'Phone+PIN accounts cannot be granted % role. Use a real email or Google account for staff access.', NEW.role;
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

-- ====================================================================
-- Source: 20260726090000_update_delivery_windows.sql
-- ====================================================================
-- Replace the delivery window schedule with the requested one:
-- Morning 7-11, Afternoon 12-5, Dinner 6-10. Updates existing location
-- rows in place (config is just data, not something migrations should
-- re-INSERT and risk duplicating).
UPDATE public.locations
SET config = jsonb_set(
  config,
  '{delivery_windows}',
  '[
    {"label": "morning",   "start": "07:00", "end": "11:00", "cutoff": "06:30"},
    {"label": "afternoon", "start": "12:00", "end": "17:00", "cutoff": "11:30"},
    {"label": "dinner",    "start": "18:00", "end": "22:00", "cutoff": "17:30"}
  ]'::jsonb
)
WHERE config ? 'delivery_windows';

-- ====================================================================
-- Source: 20260727060000_catalog_images.sql
-- ====================================================================
-- Categories didn't have an image field at all (only icon_key, a Lucide
-- icon name, not a real photo). Products already had image_url but nothing
-- ever wrote to it, and there was no upload path.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Public bucket (unlike the private ask-attachments one) -- product and
-- category photos are meant to be freely visible to any customer browsing
-- the storefront, so a plain public URL is the right model here, not a
-- signed URL per view.
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view (bucket is public, but an explicit SELECT policy is still
-- required since RLS is on by default for storage.objects).
DROP POLICY IF EXISTS "catalog-images: public read" ON storage.objects;
CREATE POLICY "catalog-images: public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'catalog-images');

-- Only admin can upload/replace/remove catalog images -- this is a
-- merchandising decision, not something any staff role should touch.
DROP POLICY IF EXISTS "catalog-images: admin can write" ON storage.objects;
CREATE POLICY "catalog-images: admin can write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "catalog-images: admin can update" ON storage.objects;
CREATE POLICY "catalog-images: admin can update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "catalog-images: admin can delete" ON storage.objects;
CREATE POLICY "catalog-images: admin can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));

-- ====================================================================
-- Source: 20260728060000_order_push_subscriptions.sql
-- ====================================================================
-- Push subscriptions are tied to a specific order, not a customer account --
-- guests (the majority of orders) have no account to attach a subscription
-- to, but they can still opt in to "notify me about this order" from the
-- tracking page itself.
CREATE TABLE public.order_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, endpoint)
);
GRANT ALL ON public.order_push_subscriptions TO service_role;
ALTER TABLE public.order_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policy at all -- writes go through the
-- subscribeToOrderPush server function (service_role), same pattern as
-- every other write path in this app. Nobody needs to read these directly.

-- ====================================================================
-- Source: 20260801065940_d04763ca-f5b3-4447-9a0e-5f4f32349ba1.sql
-- ====================================================================
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
-- ====================================================================
-- Source: 20260801090000_local_catalog_polish.sql
-- ====================================================================
-- Local catalog polish for semi-rural Karimangalam: additive seed items only.
-- Existing categories, routes, and product semantics are preserved.

INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
VALUES
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Dosa', 'Breakfast tiffin', NULL, false, false, true, 20, ARRAY['popular','breakfast']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Poori set', 'Breakfast tiffin', NULL, false, false, true, 21, ARRAY['popular','breakfast']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Parotta', 'Evening tiffin', NULL, false, false, true, 22, ARRAY['popular','dinner']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Chicken rice', 'Restaurant pickup', NULL, false, false, true, 23, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Chicken noodles', 'Restaurant pickup', NULL, false, false, true, 24, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Fish fry', 'Restaurant pickup', NULL, false, false, true, 25, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Tea or coffee', 'Local shop pickup', NULL, false, false, true, 26, ARRAY['popular','beverage']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Eggs', 'Pack size confirmed before delivery', NULL, false, false, true, 20, ARRAY['popular','grocery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Bread', 'Brand confirmed before delivery', NULL, false, false, true, 21, ARRAY['popular','bakery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Cooking oil', 'Brand and size confirmed before delivery', NULL, false, false, true, 22, ARRAY['grocery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Soap, shampoo or toothpaste', 'Daily personal essentials', NULL, false, false, true, 23, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Detergent', 'Brand and size confirmed before delivery', NULL, false, false, true, 24, ARRAY['household']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Band-Aid / basic first aid', 'Availability confirmed before delivery', NULL, false, false, false, 25, ARRAY['medicine','first-aid']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Baby products', 'Diapers, wipes and basics', NULL, false, false, true, 26, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Women''s essentials', 'Hygiene essentials with discreet delivery', NULL, false, false, true, 27, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Water can', '20L can subject to local availability', NULL, false, false, true, 28, ARRAY['popular','water']),
((SELECT id FROM public.categories WHERE slug='travel' AND parent_id IS NULL), 'Phone recharge assistance', 'Tell us operator and amount', NULL, false, true, false, 20, ARRAY['popular','utility']),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Tailor pickup', 'Alteration pickup and drop', NULL, false, true, true, 20, ARRAY['local-service']),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Local delivery', 'Documents or small parcels nearby', NULL, false, true, true, 21, ARRAY['popular','courier'])
ON CONFLICT DO NOTHING;

-- ====================================================================
-- Source: 20260802073614_3e8477ce-514c-4f7c-a885-097166bedca9.sql
-- ====================================================================
CREATE TABLE public.order_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, endpoint)
);
GRANT ALL ON public.order_push_subscriptions TO service_role;
ALTER TABLE public.order_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- ====================================================================
-- Source: 20260802093000_phase2_tamil_nadu_catalog.sql
-- ====================================================================
-- Phase 2 catalog curation for semi-urban Tamil Nadu buying behaviour.
-- Additive/reordering migration: preserves existing slugs, routes, products, cart, checkout, and admin flows.

UPDATE public.categories
SET name = CASE slug
  WHEN 'daily' THEN 'Daily Essentials'
  WHEN 'beauty' THEN 'Pharmacy & Personal Care'
  WHEN 'travel' THEN 'e-Seva & Documentation'
  WHEN 'stay' THEN 'Local Assistance'
  ELSE name
END,
sort_order = CASE slug
  WHEN 'food' THEN 1
  WHEN 'daily' THEN 2
  WHEN 'beauty' THEN 3
  WHEN 'travel' THEN 4
  WHEN 'stay' THEN 5
  WHEN 'services' THEN 13
  WHEN 'rentals' THEN 6
  ELSE sort_order
END
WHERE parent_id IS NULL;

WITH desired(name, slug, icon_key, sort_order) AS (
  VALUES
    ('Bakery', 'bakery', 'croissant', 7),
    ('Juices & Beverages', 'beverages', 'glass-water', 8),
    ('Desserts', 'desserts', 'ice-cream', 9),
    ('Cakes', 'cakes', 'cake', 10),
    ('Snacks', 'snacks', 'cookie', 11),
    ('Fruits', 'fruits', 'apple', 12)
)
INSERT INTO public.categories (name, slug, icon_key, sort_order)
SELECT name, slug, icon_key, sort_order FROM desired
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = desired.slug);

WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL),
desired(name, slug, icon_key, sort_order) AS (
  VALUES
    ('Breakfast', 'food-breakfast', 'coffee', 1),
    ('Lunch', 'food-lunch', 'utensils-crossed', 2),
    ('Dinner', 'food-dinner', 'moon', 3),
    ('Rice & Chinese', 'food-rice-chinese', 'bowl-chopsticks', 4),
    ('Side Dishes', 'food-side-dishes', 'drumstick', 5),
    ('Curries', 'food-curries', 'soup', 6)
)
INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order)
SELECT desired.name, desired.slug, food.id, desired.icon_key, desired.sort_order
FROM desired CROSS JOIN food
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = desired.slug);

UPDATE public.categories SET sort_order = CASE slug
  WHEN 'food-breakfast' THEN 1 WHEN 'food-tiffin' THEN 1
  WHEN 'food-lunch' THEN 2 WHEN 'food-dinner' THEN 3
  WHEN 'food-rice-chinese' THEN 4 WHEN 'food-side-dishes' THEN 5 WHEN 'food-curries' THEN 6
  ELSE sort_order END
WHERE parent_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL);

WITH product_seed(category_slug, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags) AS (
  VALUES
    ('food', 'Idli (2 pcs)', 'Soft steamed breakfast idli with chutney/sambar availability confirmed.', 20, true, true, false, true, 1, ARRAY['breakfast','popular']),
    ('food', 'Mini Idli (14 pcs)', 'Bite-sized mini idli breakfast portion.', 50, true, true, false, true, 2, ARRAY['breakfast','popular']),
    ('food', 'Dosa (1 pc)', 'Crispy dosa with chutney/sambar.', 45, true, true, false, true, 3, ARRAY['breakfast','popular']),
    ('food', 'Masala Dosa (1 pc)', 'Dosa with potato masala filling.', 65, true, true, false, true, 4, ARRAY['breakfast','popular']),
    ('food', 'Poori (2 pcs)', 'Poori set with masala.', 45, true, true, false, true, 5, ARRAY['breakfast','popular']),
    ('food', 'Pongal (Plate)', 'Hot ven pongal breakfast plate.', 50, true, true, false, true, 6, ARRAY['breakfast','popular']),
    ('food', 'Veg Meals (Plate)', 'Tamil Nadu veg meals plate.', 90, true, true, false, true, 10, ARRAY['lunch','popular']),
    ('food', 'Chicken Meals (Plate)', 'Meals plate with chicken gravy availability confirmed.', 140, true, false, false, true, 11, ARRAY['lunch','popular']),
    ('food', 'Curd Rice (Plate)', 'Comfort curd rice plate.', 50, true, true, false, true, 12, ARRAY['lunch','popular']),
    ('food', 'Lemon Rice (Plate)', 'Lemon rice plate for quick lunch.', 45, true, true, false, true, 13, ARRAY['lunch','popular']),
    ('food', 'Tomato Rice (Plate)', 'Tomato rice plate for quick lunch.', 45, true, true, false, true, 14, ARRAY['lunch','popular']),
    ('food', 'Chicken Biryani (Plate)', 'Local hotel chicken biryani plate.', 140, true, false, false, true, 20, ARRAY['dinner','popular']),
    ('food', 'Chapati (2 pcs)', 'Chapati set with kurma/gravy.', 40, true, true, false, true, 21, ARRAY['dinner','popular']),
    ('food', 'Parotta (2 pcs)', 'Layered parotta set with salna.', 40, true, true, false, true, 22, ARRAY['dinner','popular']),
    ('food', 'Kothu Parotta (Plate)', 'Chopped parotta plate from local hotel.', 90, true, false, false, true, 23, ARRAY['dinner','popular']),
    ('food', 'Chicken Fried Rice (Plate)', 'Restaurant-style chicken fried rice.', 120, true, false, false, true, 30, ARRAY['rice-chinese','popular']),
    ('food', 'Egg Fried Rice (Plate)', 'Restaurant-style egg fried rice.', 100, true, false, false, true, 31, ARRAY['rice-chinese','popular']),
    ('food', 'Veg Fried Rice (Plate)', 'Restaurant-style veg fried rice.', 90, true, true, false, true, 32, ARRAY['rice-chinese','popular']),
    ('food', 'Chicken Noodles (Plate)', 'Restaurant-style chicken noodles.', 120, true, false, false, true, 33, ARRAY['rice-chinese','popular']),
    ('food', 'Egg Noodles (Plate)', 'Restaurant-style egg noodles.', 100, true, false, false, true, 34, ARRAY['rice-chinese','popular']),
    ('food', 'Chicken 65 (Plate)', 'Spicy chicken 65 side dish.', 120, true, false, false, true, 40, ARRAY['side-dishes','popular']),
    ('food', 'Fish 65 (Plate)', 'Fish 65 side dish availability confirmed.', 130, true, false, false, true, 41, ARRAY['side-dishes','popular']),
    ('food', 'Chilli Chicken (Plate)', 'Chilli chicken side dish.', 130, true, false, false, true, 42, ARRAY['side-dishes','popular']),
    ('daily', 'Milk (500 ml)', 'Packet milk; brand confirmed before delivery.', 28, true, true, false, true, 1, ARRAY['daily-essentials','popular']),
    ('daily', 'Bread (400 g)', 'Fresh bread loaf; brand confirmed before delivery.', 45, true, true, false, true, 2, ARRAY['daily-essentials','popular']),
    ('daily', 'Eggs (6 pcs)', 'Fresh eggs half-dozen pack.', 45, true, false, false, true, 3, ARRAY['daily-essentials','popular']),
    ('beauty', 'Sanitary Pads (Pack)', 'Discreet pickup of sanitary pad pack.', 45, true, NULL, false, true, 1, ARRAY['personal-care','popular']),
    ('beauty', 'Band-Aid (Pack)', 'Basic adhesive bandage pack.', 30, true, NULL, false, false, 2, ARRAY['first-aid','popular']),
    ('travel', 'Mobile Recharge', 'Share operator and amount; service fee shown before order.', NULL, false, NULL, true, false, 1, ARRAY['eseva','popular']),
    ('stay', 'Hotel Booking Assistance', 'We help find and confirm nearby hotel rooms.', NULL, false, NULL, true, true, 1, ARRAY['local-assistance','popular']),
    ('stay', 'Lodge Booking Assistance', 'Local lodge availability check and booking help.', NULL, false, NULL, true, true, 2, ARRAY['local-assistance']),
    ('stay', 'Parent Assistance', 'Help parents or family members locally when you are away.', NULL, false, NULL, true, true, 3, ARRAY['local-assistance']),
    ('stay', 'Guest Pickup', 'Pickup coordination for visiting guests.', NULL, false, NULL, true, true, 4, ARRAY['local-assistance']),
    ('stay', 'Medicine Pickup', 'Pickup medicines from local pharmacy as requested.', NULL, false, NULL, true, false, 5, ARRAY['local-assistance']),
    ('stay', 'Need Anything', 'Custom local request handled by MyTown.', NULL, false, NULL, true, true, 99, ARRAY['custom','popular']),
    ('services', 'Courier Pickup', 'Small parcel or document pickup coordination.', NULL, false, NULL, true, true, 1, ARRAY['local-service']),
    ('services', 'Shopping Assistance', 'We shop locally based on your list.', NULL, false, NULL, true, true, 2, ARRAY['local-service']),
    ('services', 'Gift Delivery', 'Gift pickup and delivery coordination.', NULL, false, NULL, true, true, 3, ARRAY['local-service']),
    ('services', 'Flower Delivery', 'Flower purchase and delivery coordination.', NULL, false, NULL, true, true, 4, ARRAY['local-service']),
    ('services', 'Queue Standing', 'Queue assistance at local offices or counters.', NULL, false, NULL, true, true, 5, ARRAY['local-service']),
    ('services', 'Government Office Assistance', 'Local government-office guidance and visits.', NULL, false, NULL, true, true, 6, ARRAY['local-service']),
    ('services', 'Document Submission', 'Submit documents locally as instructed.', NULL, false, NULL, true, true, 7, ARRAY['local-service']),
    ('services', 'Translation Assistance', 'Tamil/English assistance for local tasks.', NULL, false, NULL, true, true, 8, ARRAY['local-service']),
    ('services', 'Local Guide', 'Local guidance for guests and new employees.', NULL, false, NULL, true, true, 9, ARRAY['local-service']),
    ('services', 'Custom Request', 'Tell MyTown what you need locally.', NULL, false, NULL, true, true, 10, ARRAY['local-service','popular']),
    ('bakery', 'Veg Puff (1 pc)', 'Bakery veg puff.', 20, true, true, false, true, 1, ARRAY['bakery','popular']),
    ('bakery', 'Egg Puff (1 pc)', 'Bakery egg puff.', 25, true, false, false, true, 2, ARRAY['bakery','popular']),
    ('bakery', 'Chicken Puff (1 pc)', 'Bakery chicken puff.', 35, true, false, false, true, 3, ARRAY['bakery','popular']),
    ('beverages', 'Watermelon Juice (300 ml)', 'Fresh watermelon juice.', 40, true, true, false, true, 1, ARRAY['juice','popular']),
    ('beverages', 'Oreo Shake (300 ml)', 'Oreo milkshake.', 80, true, true, false, true, 2, ARRAY['shake','popular']),
    ('beverages', 'Chocolate Shake (300 ml)', 'Chocolate milkshake.', 80, true, true, false, true, 3, ARRAY['shake','popular']),
    ('beverages', 'Coca-Cola (250 ml)', 'Coca-Cola bottle/can subject to availability.', 20, true, true, false, true, 4, ARRAY['soft-drink','popular']),
    ('beverages', 'Pepsi (250 ml)', 'Pepsi bottle/can subject to availability.', 20, true, true, false, true, 5, ARRAY['soft-drink','popular']),
    ('cakes', 'Black Forest Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 450, true, true, false, true, 1, ARRAY['cakes','popular']),
    ('fruits', 'Apple (1 kg)', 'Fresh apple by weight.', 180, true, true, false, true, 1, ARRAY['fruits']),
    ('fruits', 'Banana (1 dozen)', 'Fresh banana dozen.', 60, true, true, false, true, 2, ARRAY['fruits','popular'])
)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT c.id, p.name, p.description, p.price, p.show_price, p.is_veg, p.is_service, p.schedulable, p.sort_order, p.tags
FROM product_seed p
JOIN public.categories c ON c.slug = p.category_slug AND c.parent_id IS NULL
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = c.id);

-- ====================================================================
-- Source: 20260803081829_7900a232-4c63-44bc-b8d6-ba7c43852d21.sql
-- ====================================================================
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mytown_prevent_pin_privileged_role() FROM anon, authenticated;
-- ====================================================================
-- Source: 20260803081918_cfd053f5-698a-4157-a0ea-d6f945cccd93.sql
-- ====================================================================
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mytown_prevent_pin_privileged_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
-- ====================================================================
-- Source: 20260804090000_release_1_order_status_and_audit_fixes.sql
-- ====================================================================
-- Release 1: unblock order updates and repair audit logging identity
-- Keep the requested-date validation at INSERT time through the RLS policy,
-- while allowing UPDATEs to succeed for historical orders.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_requested_date_range;

-- audit_log was created against public.staff(id), but the app writes auth.users.id.
-- Repoint the FK so audit inserts are not silently rejected.
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_staff_id_fkey;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ====================================================================
-- Source: 20260804091000_release_2_service_fee_totals_and_order_cancellation.sql
-- ====================================================================
-- Release 2: expose order totals across surfaces and add a safe cancellation trail.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_role TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (refund_status IN ('not_applicable','pending','processed','failed')),
  ADD COLUMN IF NOT EXISTS service_fee_final NUMERIC(10,2);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancellation_state_check
  CHECK (
    (status <> 'cancelled') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  );

-- ====================================================================
-- Source: 20260804100000_release_4_generic_notifications.sql
-- ====================================================================
-- Release 4: generic notifications foundation.
-- This keeps the legacy order-only push schema in place while enabling a device-based
-- notification pipeline that can fan out order updates and future campaigns.
CREATE TABLE public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web','android','ios')),
  topics TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_idx ON public.push_devices (user_id, last_seen_at DESC);
CREATE INDEX push_devices_platform_idx ON public.push_devices (platform, last_seen_at DESC);
GRANT ALL ON public.push_devices TO service_role;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'order_update' CHECK (type IN ('order_update','delivery_update','offer','new_category','flash_sale','maintenance','service_update','festival','emergency')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  deep_link TEXT,
  category TEXT,
  target TEXT NOT NULL DEFAULT 'everyone' CHECK (target IN ('everyone','customers','staff','admins','selected_users')),
  target_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_campaigns_status_idx ON public.notification_campaigns (status, scheduled_at);
GRANT ALL ON public.notification_campaigns TO service_role;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','pruned')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_campaign_idx ON public.notification_deliveries (campaign_id, status);
CREATE INDEX notification_deliveries_device_idx ON public.notification_deliveries (device_id, status);
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- Source: 20260805191346_6cdb0087-a6c2-4bf8-a62e-8133025d74da.sql
-- ====================================================================
DELETE FROM public.notification_campaigns WHERE title = 'Hi' AND body = 'Hi';
-- ====================================================================
-- Source: 20260811090000_drop_anon_insert_policies.sql
-- ====================================================================
-- Drop anon/authenticated INSERT policies on customers and orders.
-- createOrder uses supabaseAdmin (service_role), which bypasses RLS entirely,
-- so these policies are unused by legitimate code. They allow any anonymous
-- client to insert arbitrary rows directly via the PostgREST API.
-- order_items and order_attachments INSERT policies were already dropped in
-- migration 20260726033141; this catches the two that were missed.

DROP POLICY IF EXISTS insert_customers_anyone ON public.customers;
DROP POLICY IF EXISTS insert_orders_anyone ON public.orders;

-- ====================================================================
-- Source: 20260811100000_drop_legacy_employee_pin_auth.sql
-- ====================================================================
-- The legacy PIN-based employee login (employeeLogin/updateOrderStatus server
-- functions in api.functions.ts) was removed from the app in favor of the
-- Supabase Auth staff console (/staff). Nothing in the codebase calls
-- mytown_verify_employee_pin anymore, and public.employees already had no
-- anon/authenticated grants (service_role only) -- both are now fully dead
-- and only exist to hold a seeded default PIN ('482571') at rest. Drop them.

DROP FUNCTION IF EXISTS public.mytown_verify_employee_pin(TEXT);
DROP TABLE IF EXISTS public.employees;

-- ====================================================================
-- Source: 20260811110000_orders_idempotency_key.sql
-- ====================================================================
-- Lets createOrder recognize a genuine network-retry of the exact same
-- checkout submit (distinct from the client's own double-click guard) and
-- return the already-created order instead of inserting a duplicate.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index: only enforced when a key is actually supplied, so
-- historical rows and any future non-checkout order-creation path (if one
-- is ever added) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ====================================================================
-- Source: 20260811120000_phase3_curated_catalog.sql
-- ====================================================================
-- Phase 3: real-world Tamil Nadu catalog curation (pricing, units, combos),
-- category icon/name fixes, and Local Assistance/Local Services consolidation.
-- Additive + corrective only: no slugs, routes, or rows are deleted, so
-- historical orders (order_items.product_id) stay intact. Superseded
-- placeholder rows are deprecated via is_available = false, never dropped.

-- ============================================================================
-- 1. Category icon fixes -- these were left stale when categories were
--    renamed in the phase2 migration (name changed, icon_key did not).
-- ============================================================================
UPDATE public.categories SET icon_key = 'pill' WHERE slug = 'beauty';
UPDATE public.categories SET icon_key = 'file-text' WHERE slug = 'travel';
UPDATE public.categories SET icon_key = 'heart-handshake' WHERE slug = 'stay';
UPDATE public.categories SET icon_key = 'moon' WHERE slug = 'food-dinner';
UPDATE public.categories SET icon_key = 'cooking-pot' WHERE slug = 'food-rice-chinese';
UPDATE public.categories SET icon_key = 'drumstick' WHERE slug = 'food-side-dishes';
UPDATE public.categories SET icon_key = 'soup' WHERE slug = 'food-curries';

-- ============================================================================
-- 2. Clearer names
-- ============================================================================
UPDATE public.categories SET name = 'Curry & Gravies' WHERE slug = 'food-curries';
UPDATE public.categories SET name = 'Ice Cream & Desserts' WHERE slug = 'desserts';
UPDATE public.categories SET name = 'Snacks & Chocolates' WHERE slug = 'snacks';

-- ============================================================================
-- 3. Consolidate "Local Services" into "Local Assistance" -- these were two
--    near-duplicate top-level tiles with overlapping content, which is the
--    kind of category clutter that hurts conversion. Move its products under
--    Local Assistance and demote the row itself to a child so it stops
--    showing as its own top-level tile. Nothing is deleted.
-- ============================================================================
UPDATE public.products
SET category_id = (SELECT id FROM public.categories WHERE slug = 'stay')
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'services');

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'stay'), sort_order = 99
WHERE slug = 'services';

UPDATE public.products SET name = 'Parcel Pickup / Courier Drop'
WHERE name = 'Courier Pickup' AND category_id = (SELECT id FROM public.categories WHERE slug = 'stay');

-- ============================================================================
-- 4. Deprecate vague/unpriced rows that are now superseded by a specific,
--    priced equivalent below. is_available = false keeps them out of the
--    customer catalog without breaking any historical order reference.
-- ============================================================================
UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
  AND name IN ('Dosa', 'Poori set', 'Parotta', 'Chicken noodles', 'Tea or coffee');

UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'daily' AND parent_id IS NULL)
  AND name IN ('Eggs', 'Bread', 'Band-Aid / basic first aid', 'Women''s essentials', 'Soap, shampoo or toothpaste');

UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
  AND name = 'Kothu Parotta (Plate)';

-- ============================================================================
-- 5. Price/name corrections on existing rows to match real Tamil Nadu pricing
-- ============================================================================
UPDATE public.products SET name = 'Idli (2 pcs)', price = 15 WHERE name = 'Idli (2 pcs)';
UPDATE public.products SET name = 'Mini Idli (14 pcs)', price = 40 WHERE name = 'Mini Idli (14 pcs)';
UPDATE public.products SET price = 40 WHERE name = 'Dosa (1 pc)';
UPDATE public.products SET price = 60 WHERE name = 'Masala Dosa (1 pc)';
UPDATE public.products SET price = 50, tags = ARRAY['lunch','popular'] WHERE name = 'Chicken Meals (Plate)';
UPDATE public.products SET price = 150 WHERE name = 'Chicken Meals (Plate)';
UPDATE public.products SET price = 50 WHERE name = 'Lemon Rice (Plate)';
UPDATE public.products SET price = 50 WHERE name = 'Tomato Rice (Plate)';
UPDATE public.products SET price = 170, tags = ARRAY['lunch','popular'] WHERE name = 'Chicken Biryani (Plate)';

-- ============================================================================
-- 6. New products -- Breakfast (6 AM - 11 AM), all served with sambar +
--    coconut chutney unless noted.
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Ghee Idli (2 pcs)', 'Idli finished with ghee. Served with sambar & coconut chutney.', 35::numeric, true, 7, ARRAY['breakfast']),
  ('Kal Dosa (2 pcs)', 'Soft thick dosa. Served with sambar & coconut chutney.', 50::numeric, true, 8, ARRAY['breakfast']),
  ('Onion Dosa', 'Crisp dosa topped with onion. Served with chutney.', 55::numeric, true, 9, ARRAY['breakfast']),
  ('Rava Dosa', 'Crisp semolina dosa. Served with chutney.', 65::numeric, true, 10, ARRAY['breakfast']),
  ('Ghee Roast', 'Extra-crisp dosa roasted in ghee.', 70::numeric, true, 11, ARRAY['breakfast']),
  ('Vada (1 pc)', 'Crisp fried lentil vada.', 12::numeric, true, 12, ARRAY['breakfast']),
  ('Medu Vada (2 pcs)', 'Classic medu vada pair. Served with sambar & chutney.', 25::numeric, true, 13, ARRAY['breakfast']),
  ('Omelette (2 Eggs)', 'Two-egg omelette.', 30::numeric, false, 14, ARRAY['breakfast']),
  ('Boiled Egg', 'Single boiled egg.', 10::numeric, false, 15, ARRAY['breakfast']),
  ('Filter Coffee', 'Fresh filter coffee.', 15::numeric, true, 16, ARRAY['breakfast','popular']),
  ('Tea', 'Hot tea.', 10::numeric, true, 17, ARRAY['breakfast','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 7. New products -- Lunch
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Mini Meals (Plate)', 'Smaller veg meals plate.', 70::numeric, true, 15, ARRAY['lunch']),
  ('Fish Meals (Plate)', 'Meals plate with fish gravy, subject to availability.', 170::numeric, false, 16, ARRAY['lunch']),
  ('Tamarind Rice (Plate)', 'Puliyodharai-style tamarind rice.', 50::numeric, true, 17, ARRAY['lunch']),
  ('Kuska (Plate)', 'Plain biryani rice with raita.', 70::numeric, true, 18, ARRAY['lunch']),
  ('Veg Biryani (Plate)', 'Vegetable biryani with raita.', 110::numeric, true, 19, ARRAY['lunch','popular']),
  ('Mutton Biryani (Plate)', 'Mutton biryani, subject to availability.', 260::numeric, false, 20, ARRAY['lunch'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 8. New products -- Dinner
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Veg Kothu Parotta (Plate)', 'Chopped parotta stir-fried with vegetables.', 90::numeric, true, 24, ARRAY['dinner','popular']),
  ('Egg Kothu Parotta (Plate)', 'Chopped parotta stir-fried with egg.', 110::numeric, false, 25, ARRAY['dinner','popular']),
  ('Chicken Kothu Parotta (Plate)', 'Chopped parotta stir-fried with chicken.', 140::numeric, false, 26, ARRAY['dinner','popular']),
  ('Butter Naan (2 pcs)', 'Soft naan finished with butter.', 70::numeric, true, 27, ARRAY['dinner']),
  ('Tandoori Roti (2 pcs)', 'Whole-wheat tandoori roti.', 60::numeric, true, 28, ARRAY['dinner'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 9. New products -- Curry & Gravies (bowls, add to any meal/parotta/chapati)
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Veg Kurma (Bowl)', 'Mixed vegetable kurma.', 60::numeric, true, 50, ARRAY['curries','popular']),
  ('Chicken Kurma (Bowl)', 'Chicken kurma gravy.', 100::numeric, false, 51, ARRAY['curries','popular']),
  ('Chettinad Chicken Curry (Bowl)', 'Spicy Chettinad-style chicken curry.', 110::numeric, false, 52, ARRAY['curries']),
  ('Kadai Chicken (Bowl)', 'Kadai-style chicken curry.', 110::numeric, false, 53, ARRAY['curries']),
  ('Butter Chicken (Bowl)', 'Creamy butter chicken gravy.', 130::numeric, false, 54, ARRAY['curries']),
  ('Paneer Butter Masala (Bowl)', 'Paneer in a creamy tomato gravy.', 110::numeric, true, 55, ARRAY['curries']),
  ('Dal Fry (Bowl)', 'Tempered dal.', 50::numeric, true, 56, ARRAY['curries'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 10. New products -- Rice & Chinese
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Mushroom Fried Rice (Plate)', 'Restaurant-style mushroom fried rice.', 100::numeric, true, 35, ARRAY['rice-chinese']),
  ('Gobi Fried Rice (Plate)', 'Restaurant-style cauliflower fried rice.', 90::numeric, true, 36, ARRAY['rice-chinese']),
  ('Veg Noodles (Plate)', 'Restaurant-style vegetable noodles.', 90::numeric, true, 37, ARRAY['rice-chinese']),
  ('Mushroom Noodles (Plate)', 'Restaurant-style mushroom noodles.', 100::numeric, true, 38, ARRAY['rice-chinese']),
  ('Gobi Noodles (Plate)', 'Restaurant-style cauliflower noodles.', 90::numeric, true, 39, ARRAY['rice-chinese'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 11. New products -- Side Dishes
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Pepper Chicken (Plate)', 'Pepper chicken dry side dish.', 130::numeric, false, 43, ARRAY['side-dishes']),
  ('Dragon Chicken (Plate)', 'Indo-Chinese dragon chicken.', 140::numeric, false, 44, ARRAY['side-dishes']),
  ('Gobi Manchurian (Plate)', 'Crispy cauliflower Manchurian.', 90::numeric, true, 45, ARRAY['side-dishes']),
  ('Mushroom Manchurian (Plate)', 'Crispy mushroom Manchurian.', 100::numeric, true, 46, ARRAY['side-dishes']),
  ('Paneer Manchurian (Plate)', 'Crispy paneer Manchurian.', 110::numeric, true, 47, ARRAY['side-dishes']),
  ('Egg Masala (Plate)', 'Boiled eggs in a spiced masala gravy.', 90::numeric, false, 48, ARRAY['side-dishes']),
  ('French Fries (Plate)', 'Crispy salted fries.', 70::numeric, true, 49, ARRAY['side-dishes','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 12. Beverages -- juices, milkshakes, soft drinks together under one tile
-- ============================================================================
WITH bev AS (SELECT id FROM public.categories WHERE slug = 'beverages')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT bev.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM bev CROSS JOIN (VALUES
  ('Apple Juice (300 ml)', 'Fresh apple juice.', 45::numeric, 10, ARRAY['juice']),
  ('Orange Juice (300 ml)', 'Fresh orange juice.', 45::numeric, 11, ARRAY['juice']),
  ('Sweet Lime Juice (300 ml)', 'Fresh sweet lime (mosambi) juice.', 40::numeric, 12, ARRAY['juice','popular']),
  ('Pineapple Juice (300 ml)', 'Fresh pineapple juice.', 40::numeric, 13, ARRAY['juice']),
  ('Grape Juice (300 ml)', 'Fresh grape juice.', 45::numeric, 14, ARRAY['juice']),
  ('Mango Juice (300 ml)', 'Fresh mango juice, seasonal.', 50::numeric, 15, ARRAY['juice','popular']),
  ('Pomegranate Juice (300 ml)', 'Fresh pomegranate juice.', 60::numeric, 16, ARRAY['juice']),
  ('Mixed Fruit Juice (300 ml)', 'Mixed seasonal fruit juice.', 45::numeric, 17, ARRAY['juice']),
  ('Lemon Juice (300 ml)', 'Fresh lemon juice / nannari.', 30::numeric, 18, ARRAY['juice']),
  ('KitKat Shake (300 ml)', 'KitKat milkshake.', 85::numeric, 20, ARRAY['shake','popular']),
  ('Vanilla Shake (300 ml)', 'Vanilla milkshake.', 75::numeric, 21, ARRAY['shake']),
  ('Strawberry Shake (300 ml)', 'Strawberry milkshake.', 80::numeric, 22, ARRAY['shake']),
  ('Mango Shake (300 ml)', 'Mango milkshake, seasonal.', 80::numeric, 23, ARRAY['shake']),
  ('Butterscotch Shake (300 ml)', 'Butterscotch milkshake.', 80::numeric, 24, ARRAY['shake']),
  ('Sprite (250 ml)', 'Subject to availability.', 20::numeric, 30, ARRAY['soft-drink']),
  ('Fanta (250 ml)', 'Subject to availability.', 20::numeric, 31, ARRAY['soft-drink']),
  ('Maaza (250 ml)', 'Subject to availability.', 20::numeric, 32, ARRAY['soft-drink']),
  ('Slice (250 ml)', 'Subject to availability.', 20::numeric, 33, ARRAY['soft-drink']),
  ('7UP (250 ml)', 'Subject to availability.', 20::numeric, 34, ARRAY['soft-drink']),
  ('Limca (250 ml)', 'Subject to availability.', 20::numeric, 35, ARRAY['soft-drink']),
  ('Red Bull (250 ml)', 'Subject to availability.', 125::numeric, 36, ARRAY['soft-drink'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = bev.id);

-- ============================================================================
-- 13. Bakery -- rolls, puffs, bakery snacks
-- ============================================================================
WITH bakery AS (SELECT id FROM public.categories WHERE slug = 'bakery')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT bakery.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM bakery CROSS JOIN (VALUES
  ('Mushroom Puff (1 pc)', 'Bakery mushroom puff.', 30::numeric, true, 4, ARRAY['bakery']),
  ('Veg Roll (1 pc)', 'Bakery vegetable roll.', 30::numeric, true, 5, ARRAY['bakery']),
  ('Chicken Roll (1 pc)', 'Bakery chicken roll.', 45::numeric, false, 6, ARRAY['bakery']),
  ('Cream Bun (1 pc)', 'Sweet cream bun.', 25::numeric, true, 7, ARRAY['bakery']),
  ('Donut (1 pc)', 'Glazed donut.', 35::numeric, true, 8, ARRAY['bakery']),
  ('Brownie (1 pc)', 'Chocolate brownie.', 45::numeric, true, 9, ARRAY['bakery','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = bakery.id);

-- ============================================================================
-- 14. Cakes -- more flavours + weight variants
-- ============================================================================
WITH cakes AS (SELECT id FROM public.categories WHERE slug = 'cakes')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT cakes.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM cakes CROSS JOIN (VALUES
  ('Black Forest Cake (1 kg)', 'Bakery cake; freshness and availability confirmed.', 850::numeric, 2, ARRAY['cakes']),
  ('White Forest Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 480::numeric, 3, ARRAY['cakes']),
  ('Red Velvet Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 550::numeric, 4, ARRAY['cakes','popular']),
  ('Chocolate Truffle Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 550::numeric, 5, ARRAY['cakes','popular']),
  ('Butterscotch Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 480::numeric, 6, ARRAY['cakes']),
  ('Pineapple Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 450::numeric, 7, ARRAY['cakes'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = cakes.id);

-- ============================================================================
-- 15. Ice Cream & Desserts -- previously an empty category
-- ============================================================================
WITH desserts AS (SELECT id FROM public.categories WHERE slug = 'desserts')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT desserts.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM desserts CROSS JOIN (VALUES
  ('Vanilla Ice Cream (Cup)', 'Classic vanilla cup.', 30::numeric, 1, ARRAY['ice-cream']),
  ('Chocolate Ice Cream (Cup)', 'Chocolate cup.', 35::numeric, 2, ARRAY['ice-cream']),
  ('Butterscotch Ice Cream (Cup)', 'Butterscotch cup.', 35::numeric, 3, ARRAY['ice-cream']),
  ('Black Currant Ice Cream (Cup)', 'Black currant cup.', 35::numeric, 4, ARRAY['ice-cream']),
  ('Mango Ice Cream Cone', 'Mango cone, seasonal.', 40::numeric, 5, ARRAY['ice-cream','popular']),
  ('Ice Cream Family Pack (700 ml)', 'Family pack tub, flavour confirmed before delivery.', 180::numeric, 6, ARRAY['ice-cream','popular'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = desserts.id);

-- ============================================================================
-- 16. Snacks & Chocolates -- previously an empty category
-- ============================================================================
WITH snacks AS (SELECT id FROM public.categories WHERE slug = 'snacks')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT snacks.id, p.name, p.description, p.price, true, true, false, false, p.sort_order, p.tags
FROM snacks CROSS JOIN (VALUES
  ('Dairy Milk (Bar)', 'Subject to availability.', 40::numeric, 1, ARRAY['chocolate','popular']),
  ('KitKat (Bar)', 'Subject to availability.', 25::numeric, 2, ARRAY['chocolate']),
  ('Perk (Bar)', 'Subject to availability.', 10::numeric, 3, ARRAY['chocolate']),
  ('Five Star (Bar)', 'Subject to availability.', 10::numeric, 4, ARRAY['chocolate']),
  ('Munch (Bar)', 'Subject to availability.', 10::numeric, 5, ARRAY['chocolate']),
  ('Lays (Pack)', 'Subject to availability.', 20::numeric, 6, ARRAY['snack','popular']),
  ('Bingo (Pack)', 'Subject to availability.', 20::numeric, 7, ARRAY['snack']),
  ('Kurkure (Pack)', 'Subject to availability.', 20::numeric, 8, ARRAY['snack']),
  ('Good Day (Pack)', 'Subject to availability.', 30::numeric, 9, ARRAY['snack']),
  ('Oreo (Pack)', 'Subject to availability.', 30::numeric, 10, ARRAY['snack'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = snacks.id);

-- ============================================================================
-- 17. Fruits -- unit varies by fruit (kg / dozen / piece), as it should
-- ============================================================================
WITH fruits AS (SELECT id FROM public.categories WHERE slug = 'fruits')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT fruits.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM fruits CROSS JOIN (VALUES
  ('Orange (1 kg)', 'Fresh orange by weight.', 100::numeric, 3, ARRAY['fruits']),
  ('Pomegranate (1 kg)', 'Fresh pomegranate by weight.', 160::numeric, 4, ARRAY['fruits']),
  ('Sweet Lime (1 kg)', 'Fresh sweet lime by weight.', 80::numeric, 5, ARRAY['fruits']),
  ('Papaya (1 pc)', 'Fresh papaya, sold whole.', 40::numeric, 6, ARRAY['fruits']),
  ('Watermelon (1 pc)', 'Fresh watermelon, sold whole.', 60::numeric, 7, ARRAY['fruits','popular']),
  ('Pineapple (1 pc)', 'Fresh pineapple, sold whole.', 50::numeric, 8, ARRAY['fruits']),
  ('Grapes (1 kg)', 'Fresh grapes by weight.', 90::numeric, 9, ARRAY['fruits'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = fruits.id);

-- ============================================================================
-- 18. Pharmacy & Personal Care -- OTC medicines, women's essentials, personal care
-- ============================================================================
WITH beauty AS (SELECT id FROM public.categories WHERE slug = 'beauty')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT beauty.id, p.name, p.description, p.price, p.show_price, NULL, false, p.schedulable, p.sort_order, p.tags
FROM beauty CROSS JOIN (VALUES
  ('Paracetamol (Strip)', 'OTC pain/fever relief. Availability confirmed before delivery.', 20::numeric, true, false, 10, ARRAY['medicine']),
  ('ORS (Pack)', 'Oral rehydration salts.', 25::numeric, true, false, 11, ARRAY['medicine']),
  ('Cotton Roll', 'Absorbent cotton roll.', 35::numeric, true, false, 12, ARRAY['first-aid']),
  ('Antiseptic Liquid (100 ml)', 'Wound antiseptic, brand confirmed before delivery.', 60::numeric, true, false, 13, ARRAY['first-aid']),
  ('Pain Relief Spray', 'Topical pain relief spray.', 110::numeric, true, false, 14, ARRAY['medicine']),
  ('Cough Syrup', 'OTC cough syrup, brand confirmed before delivery.', 90::numeric, true, false, 15, ARRAY['medicine']),
  ('Antacid (Strip)', 'OTC antacid tablets.', 25::numeric, true, false, 16, ARRAY['medicine']),
  ('Digital Thermometer', 'Digital body thermometer.', 150::numeric, true, false, 17, ARRAY['medicine']),
  ('Tampons (Pack)', 'Discreet pickup and delivery.', 150::numeric, true, false, 20, ARRAY['womens-essentials']),
  ('Panty Liners (Pack)', 'Discreet pickup and delivery.', 60::numeric, true, false, 21, ARRAY['womens-essentials']),
  ('Pregnancy Test Kit', 'Discreet pickup and delivery.', 60::numeric, true, false, 22, ARRAY['womens-essentials']),
  ('Heating Patch', 'Cramp-relief heating patch.', 40::numeric, true, false, 23, ARRAY['womens-essentials']),
  ('Shampoo (Sachet/Bottle)', 'Brand and size confirmed before delivery.', 50::numeric, true, true, 30, ARRAY['personal-care']),
  ('Soap (Bar)', 'Brand confirmed before delivery.', 40::numeric, true, true, 31, ARRAY['personal-care']),
  ('Face Wash', 'Brand confirmed before delivery.', 90::numeric, true, true, 32, ARRAY['personal-care']),
  ('Toothpaste', 'Brand confirmed before delivery.', 55::numeric, true, true, 33, ARRAY['personal-care']),
  ('Toothbrush', 'Standard toothbrush.', 25::numeric, true, true, 34, ARRAY['personal-care']),
  ('Deodorant', 'Brand confirmed before delivery.', 180::numeric, true, true, 35, ARRAY['personal-care']),
  ('Body Lotion', 'Brand confirmed before delivery.', 150::numeric, true, true, 36, ARRAY['personal-care']),
  ('Face Cream', 'Brand confirmed before delivery.', 120::numeric, true, true, 37, ARRAY['personal-care']),
  ('Hair Oil', 'Brand confirmed before delivery.', 90::numeric, true, true, 38, ARRAY['personal-care']),
  ('Talcum Powder', 'Brand confirmed before delivery.', 80::numeric, true, true, 39, ARRAY['personal-care'])
) AS p(name, description, price, show_price, schedulable, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = beauty.id);

-- ============================================================================
-- 19. e-Seva & Documentation -- service items, price confirmed on request
-- ============================================================================
WITH eseva AS (SELECT id FROM public.categories WHERE slug = 'travel')
INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
SELECT eseva.id, p.name, p.description, NULL, false, true, true, p.sort_order, ARRAY['eseva']
FROM eseva CROSS JOIN (VALUES
  ('Aadhaar Update Assistance', 'Help with Aadhaar detail updates. Service fee shown before you order.', 10),
  ('PAN Card Services', 'New PAN / correction assistance.', 11),
  ('Passport Appointment Help', 'Appointment booking assistance.', 12),
  ('Driving Licence Services', 'DL application/renewal assistance.', 13),
  ('Voter ID Services', 'Voter ID application/correction assistance.', 14),
  ('Income Certificate', 'Application assistance.', 15),
  ('Community Certificate', 'Application assistance.', 16),
  ('Nativity Certificate', 'Application assistance.', 17),
  ('Birth Certificate', 'Application assistance.', 18),
  ('Death Certificate', 'Application assistance.', 19),
  ('Pension Assistance', 'Pension-related application help.', 20),
  ('EB Bill Payment', 'Electricity bill payment on your behalf.', 21),
  ('Water Bill Payment', 'Water bill payment on your behalf.', 22),
  ('DTH Recharge', 'Share operator and amount.', 23),
  ('Ticket Booking', 'Bus/train/movie ticket booking assistance.', 24),
  ('Government Form Filling', 'Form filling assistance for government portals.', 25),
  ('Online Application Help', 'General online application assistance.', 26),
  ('Printout / Xerox', 'Document printing and photocopying.', 27),
  ('Spiral Binding', 'Document spiral binding.', 28),
  ('Passport Photo', 'Passport-size photo service.', 29)
) AS p(name, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = eseva.id);

-- ============================================================================
-- 20. Rentals -- bicycle & two-wheeler only, per current business scope
-- ============================================================================
WITH rentals AS (SELECT id FROM public.categories WHERE slug = 'rentals')
INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
SELECT rentals.id, p.name, p.description, p.price, true, true, true, p.sort_order, ARRAY['rental']
FROM rentals CROSS JOIN (VALUES
  ('Bicycle Rental (Hourly)', 'ID proof required at pickup.', 15::numeric, 1),
  ('Bicycle Rental (Daily)', 'ID proof required at pickup.', 80::numeric, 2),
  ('Two-Wheeler Rental (Hourly)', 'ID proof and driving licence required. Fuel extra.', 40::numeric, 3),
  ('Two-Wheeler Rental (Daily)', 'ID proof and driving licence required. Fuel extra.', 250::numeric, 4)
) AS p(name, description, price, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = rentals.id);

-- ====================================================================
-- Source: 20260811130000_price_visibility_guardrail_and_trending.sql
-- ====================================================================
-- ============================================================================
-- Price-visibility guardrail
-- ============================================================================
-- The original CHECK only blocked a product from *claiming* a price it
-- doesn't have (show_price = true with NULL price). It never blocked the
-- opposite mistake -- hiding a real price behind "price on request" -- which
-- is exactly the ambiguity that erodes trust on a catalog page. Genuine
-- services (is_service = true) still get to hide price, since those are
-- quoted per request by design; everything else must show its price once
-- one exists.
--
-- Audit: no current seed row actually has this bug (every show_price=false
-- row already has a NULL price), so this UPDATE is a no-op today -- it's
-- here as a safety net for any row that predates this constraint.
UPDATE public.products
SET show_price = true
WHERE price IS NOT NULL AND show_price = false AND is_service = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_show_price_requires_service_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_show_price_requires_service_check
      CHECK (show_price = true OR price IS NULL OR is_service = true);
  END IF;
END $$;

-- ============================================================================
-- "Trending picks" -- a curated shelf from the existing catalog (no new
-- products), surfaced above Categories on Home and on Explore for quick
-- reordering of the items this workforce actually buys daily: self-care
-- basics, snacking, and treats.
-- ============================================================================
UPDATE public.products
SET tags = tags || ARRAY['trending']
WHERE name IN (
  'Face Wash',
  'Face Cream',
  'Body Lotion',
  'Hair Oil',
  'Deodorant',
  'Talcum Powder',
  'Sanitary Pads (Pack)',
  'Mango Juice (300 ml)',
  'KitKat Shake (300 ml)',
  'Mango Ice Cream Cone',
  'Dairy Milk (Bar)',
  'Lays (Pack)'
)
AND NOT ('trending' = ANY(tags));

-- ====================================================================
-- Source: 20260812070000_delivery_batch_rider_self_claim.sql
-- ====================================================================
-- Delivery batches already group orders by delivery window (the underlying
-- mechanism the admin panel calls "Delivery batches"), but nothing tracks
-- who's actually delivering a given trip. Add self-claim: any signed-in
-- ops/admin staff can claim an unassigned batch as themselves, and release
-- it again if plans change. This is intentionally independent of the
-- existing `riders` table (a separate, unused admin-managed roster with no
-- link to an auth account) -- self-claim needs to work for whoever is
-- actually signed into the staff console right now, with zero setup.
ALTER TABLE public.delivery_batches
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_staff_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- ====================================================================
-- Source: 20260812080000_order_level_staff_assignment.sql
-- ====================================================================
-- Replaces the previous migration's batch-level self-claim: staff think
-- "this order is mine to deliver", not "I claimed an abstract delivery
-- batch". Assignment now lives directly on the order, reusing the existing
-- assigned_employee_id column -- dead weight since the old PIN-based
-- employee login was dropped (no FK, nothing reads/writes it today) --
-- rather than adding a second parallel assignment concept.
ALTER TABLE public.orders RENAME COLUMN assigned_employee_id TO assigned_staff_id;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_staff_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;


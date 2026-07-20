
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


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

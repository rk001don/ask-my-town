
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

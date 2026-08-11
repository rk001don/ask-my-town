-- Drop anon/authenticated INSERT policies on customers and orders.
-- createOrder uses supabaseAdmin (service_role), which bypasses RLS entirely,
-- so these policies are unused by legitimate code. They allow any anonymous
-- client to insert arbitrary rows directly via the PostgREST API.
-- order_items and order_attachments INSERT policies were already dropped in
-- migration 20260726033141; this catches the two that were missed.

DROP POLICY IF EXISTS insert_customers_anyone ON public.customers;
DROP POLICY IF EXISTS insert_orders_anyone ON public.orders;

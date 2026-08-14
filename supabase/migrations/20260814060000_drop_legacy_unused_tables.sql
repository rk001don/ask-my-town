-- Drop legacy tables left over from earlier designs.
--
-- These four are all EMPTY (0 rows) and are NOT referenced anywhere in the
-- application code -- the live role check uses public.user_roles, not these:
--   * staff        -- superseded by user_roles
--   * riders        -- superseded by user_roles + order-level assignment
--   * employees     -- superseded by user_roles
--   * group_orders  -- a feature that was never shipped
--
-- Deliberately NOT dropped (still in use, so they stay):
--   * delivery_batches       -- read by api.functions.ts, holds data
--   * notification_deliveries -- written by notifications-admin.functions.ts
--   * rate_limit_hits, search_analytics -- actively written to
--
-- Safe to run: IF EXISTS makes it a no-op if a table is already gone, and
-- CASCADE removes any dependent policies/constraints those dead tables owned.
-- No live table has a foreign key INTO these (orders.assigned_employee_id is a
-- plain UUID column with no FK), so nothing else is affected.
--
-- After applying, regenerate src/integrations/supabase/types.ts so the
-- TypeScript types no longer describe the removed tables.

DROP TABLE IF EXISTS public.group_orders CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.riders CASCADE;
DROP TABLE IF EXISTS public.staff CASCADE;

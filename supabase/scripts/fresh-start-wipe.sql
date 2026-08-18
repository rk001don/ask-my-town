-- =============================================================================
-- Fresh-start data wipe  (pre-launch)
-- =============================================================================
-- Clears all end-user, order, and notification data so the app launches on a
-- clean slate. KEEPS the catalogue (products, categories), the operational
-- config (locations, app_config), and -- by default -- your own team's logins
-- (staff, admins, riders and their roles). Wiping the team would lock you out
-- of your own admin panel, so that is a separate, opt-in block below.
--
-- WHERE TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file.
--
-- HOW TO RUN
--   1. Run it AS-IS first. It is a DRY RUN: everything is inside a transaction
--      that ends in ROLLBACK, so NOTHING is deleted. The final result grid
--      shows the row counts that WOULD remain. Read them.
--   2. When the numbers look right, change the last line from `ROLLBACK;` to
--      `COMMIT;` and run again to actually apply it.
--
-- Written from the committed schema; NOT executed from the dev environment
-- (local access is the publishable/anon key, which cannot delete). The dry run
-- IS the validation step -- do not skip it.
-- =============================================================================

begin;

-- ---- transactional data (children before parents) ---------------------------
-- delivery_batches is a PARENT of orders (orders reference it), so orders go
-- first, then the batches.
delete from public.order_attachments;
delete from public.order_items;
delete from public.order_push_subscriptions;
delete from public.notification_deliveries;
delete from public.notification_campaigns;
delete from public.push_devices;
delete from public.group_orders;
delete from public.orders;
delete from public.delivery_batches;

-- ephemeral / analytics -- no reason to carry these into launch either
delete from public.rate_limit_hits;
delete from public.search_analytics;
delete from public.audit_log;

-- ---- customers (guest + account rows) ---------------------------------------
delete from public.customers;

-- ---- end-user auth accounts, PRESERVING the team ----------------------------
-- Deletes every login that is NOT a staff member and NOT in user_roles.
delete from auth.users u
where not exists (select 1 from public.staff s      where s.user_id = u.id)
  and not exists (select 1 from public.user_roles r where r.user_id = u.id);

-- ---- OPTIONAL: also wipe the team (DANGER: logs you out) ---------------------
-- Uncomment ONLY if you truly want zero accounts, including your own admin.
-- You will then have to re-create an admin and re-grant roles afterwards.
--   delete from public.riders;
--   delete from public.staff;
--   delete from public.user_roles;
--   delete from auth.users;   -- everyone

-- ---- what remains (this grid is the dry-run report) --------------------------
-- The Supabase SQL editor shows the LAST statement's result, so this SELECT is
-- what you'll see. Under ROLLBACK it reflects the state that WOULD result.
select 'orders'                as table, count(*) as rows_remaining from public.orders
union all select 'customers',            count(*) from public.customers
union all select 'push_devices',         count(*) from public.push_devices
union all select 'notification_campaigns', count(*) from public.notification_campaigns
union all select 'auth.users (total)',   count(*) from auth.users
union all select 'auth.users (team kept)', count(*) from auth.users u
           where exists (select 1 from public.staff s      where s.user_id = u.id)
              or exists (select 1 from public.user_roles r where r.user_id = u.id)
union all select 'products (kept)',      count(*) from public.products
union all select 'categories (kept)',    count(*) from public.categories
order by 1;

-- Change to COMMIT; to apply for real. Left as ROLLBACK so a careless run
-- deletes nothing.
rollback;

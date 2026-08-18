-- =============================================================================
-- Fresh-start data wipe  (pre-launch)
-- =============================================================================
-- Clears all end-user, order, and notification data so the app launches on a
-- clean slate. KEEPS the catalogue (products, categories), the operational
-- config (locations, app_config), and -- by default -- your own team's logins
-- (staff, admins, riders and their roles). Wiping the team would lock you out
-- of your own admin panel, so that is a separate, opt-in block below.
--
-- HOW TO RUN
--   1. Run this AS-IS first. It is a DRY RUN: it wraps everything in a
--      transaction that ROLLS BACK at the end and prints before/after counts.
--      Nothing is deleted. Read the numbers.
--   2. When the numbers look right, change the final `ROLLBACK;` to `COMMIT;`
--      and run again to actually apply it.
--   3. Run it in the Supabase SQL editor (Dashboard > SQL Editor) on the
--      PREPROD project first. Only touch prod once you have rehearsed here.
--
-- This was written against the committed schema but has NOT been executed
-- against a live database from this environment (local access is the
-- publishable/anon key, which cannot delete). The dry run IS the validation
-- step -- do not skip it.
-- =============================================================================

begin;

-- ---- before -----------------------------------------------------------------
\echo '--- BEFORE ---'
select
  (select count(*) from public.orders)                    as orders,
  (select count(*) from public.customers)                 as customers,
  (select count(*) from public.push_devices)              as push_devices,
  (select count(*) from public.notification_campaigns)    as campaigns,
  (select count(*) from auth.users)                       as auth_users_total,
  (select count(*) from auth.users u
     where not exists (select 1 from public.staff s      where s.user_id = u.id)
       and not exists (select 1 from public.user_roles r where r.user_id = u.id)
  )                                                        as auth_users_end_customers;

-- ---- transactional data (children before parents) ---------------------------
-- order_attachments -> order_items -> orders, plus the push/notification and
-- batching tables. delivery_batches is a PARENT of orders (orders reference it),
-- so orders go first.
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
-- customers.user_id -> auth.users is ON DELETE CASCADE, but customers are
-- already gone above, so this just removes the orphaned end-user logins.
delete from auth.users u
where not exists (select 1 from public.staff s      where s.user_id = u.id)
  and not exists (select 1 from public.user_roles r where r.user_id = u.id);

-- ---- OPTIONAL: also wipe the team (DANGER: logs you out) ---------------------
-- Uncomment ONLY if you truly want zero accounts, including your own admin.
-- You will have to re-create an admin and re-grant roles afterwards.
--   delete from public.riders;
--   delete from public.staff;
--   delete from public.user_roles;
--   delete from auth.users;   -- everyone

-- ---- after ------------------------------------------------------------------
\echo '--- AFTER (dry run -- will be rolled back) ---'
select
  (select count(*) from public.orders)                 as orders,
  (select count(*) from public.customers)              as customers,
  (select count(*) from public.push_devices)           as push_devices,
  (select count(*) from public.notification_campaigns) as campaigns,
  (select count(*) from auth.users)                    as auth_users_remaining,
  (select count(*) from public.products)               as products_kept,
  (select count(*) from public.categories)             as categories_kept;

-- Change to COMMIT; to apply for real. Left as ROLLBACK so a careless run
-- deletes nothing.
rollback;

-- =============================================================================
-- Fresh-start data wipe  (pre-launch)
-- =============================================================================
-- Clears all end-user, order, and notification data so the app launches on a
-- clean slate. KEEPS the catalogue (products, categories), the operational
-- config (locations, app_config), and -- by default -- your own team's logins
-- (staff, admins, riders and their roles). Wiping the team would lock you out
-- of your own admin panel, so that is a separate, opt-in block below.
--
-- WHERE: Supabase Dashboard -> SQL Editor -> New query -> paste this whole file.
--
-- HOW:
--   1. Run AS-IS. It is a DRY RUN: everything is in a transaction that ends in
--      ROLLBACK, so NOTHING is deleted. The final grid shows what WOULD remain.
--   2. If the numbers look right, change the last line `rollback;` -> `commit;`
--      and run again to actually apply it.
--
-- This is drift-proof: it only touches tables that actually exist in THIS
-- database, so a table present in the repo schema but not deployed (e.g.
-- group_orders) is skipped rather than erroring. Deletes run child-before-
-- parent so foreign keys are satisfied.
-- =============================================================================

begin;

-- ---- delete transactional + customer data, guarding each table --------------
-- Order matters: a child (which holds the foreign key) must go before its
-- parent. orders references group_orders / delivery_batches, so orders is
-- deleted before them; everything that references customers is deleted before
-- customers.
do $$
declare
  t text;
  ordered_tables text[] := array[
    'order_attachments',
    'order_items',
    'order_push_subscriptions',
    'notification_deliveries',
    'notification_campaigns',
    'push_devices',
    'orders',
    'group_orders',
    'delivery_batches',
    'rate_limit_hits',
    'search_analytics',
    'audit_log',
    'customers'
  ];
begin
  foreach t in array ordered_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;
end $$;

-- ---- end-user auth accounts, PRESERVING the team ----------------------------
-- Deletes every login that is NOT a staff member and NOT in user_roles.
-- Refuses to run if it cannot identify the team, so it can never delete your
-- own admin login by accident.
do $$
declare
  cond text := 'true';
begin
  if to_regclass('public.staff') is null
     and to_regclass('public.user_roles') is null then
    raise exception
      'Neither public.staff nor public.user_roles exists; cannot distinguish your team from customers. Aborting so your admin login is not deleted.';
  end if;
  if to_regclass('public.staff') is not null then
    cond := cond || ' and not exists (select 1 from public.staff s where s.user_id = u.id)';
  end if;
  if to_regclass('public.user_roles') is not null then
    cond := cond || ' and not exists (select 1 from public.user_roles r where r.user_id = u.id)';
  end if;
  execute 'delete from auth.users u where ' || cond;
end $$;

-- ---- OPTIONAL: also wipe the team (DANGER: logs you out) ---------------------
-- Uncomment ONLY if you truly want zero accounts, including your own admin.
-- You will then have to re-create an admin and re-grant roles afterwards.
--   delete from public.riders;
--   delete from public.staff;
--   delete from public.user_roles;
--   delete from auth.users;   -- everyone

-- ---- what remains (this grid is the dry-run report) -------------------------
-- Built dynamically so it never errors on a table this database doesn't have.
-- Under ROLLBACK it reflects the state that WOULD result.
do $$
declare
  t text;
  n bigint;
  report_tables text[] := array[
    'orders','customers','push_devices','notification_campaigns',
    'products','categories'
  ];
begin
  create temp table _wipe_report(name text, rows_remaining bigint) on commit drop;
  foreach t in array report_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      insert into _wipe_report values (t, n);
    end if;
  end loop;
  execute 'select count(*) from auth.users' into n;
  insert into _wipe_report values ('auth.users (total)', n);
  execute '
    select count(*) from auth.users u
    where ' ||
      case when to_regclass('public.staff') is not null
           then 'exists (select 1 from public.staff s where s.user_id = u.id)'
           else 'false' end ||
      case when to_regclass('public.user_roles') is not null
           then ' or exists (select 1 from public.user_roles r where r.user_id = u.id)'
           else '' end
    into n;
  insert into _wipe_report values ('auth.users (team kept)', n);
end $$;

select name, rows_remaining from _wipe_report order by name;

-- Change to COMMIT; to apply for real. Left as ROLLBACK so a careless run
-- deletes nothing.
rollback;

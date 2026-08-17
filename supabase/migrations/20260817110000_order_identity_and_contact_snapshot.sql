-- Fix cross-account identity bleed between customers.
--
-- THE BUG
--
-- `customers` is keyed by phone number, and createOrder did an unconditional
-- upsert on it:
--
--     UPDATE customers SET name = <typed at checkout>, address = ...
--     WHERE id = <row matching that phone>
--
-- with no check on who owns that row. So anyone who typed a phone number at
-- guest checkout overwrote the name and address of the *account* that owns
-- that number, and their order attached to that account's customer row --
-- which, via the orders owner-read policy, made it visible in that account's
-- order list. Two people sharing one number therefore shared one identity:
-- last writer won the name, and each could see the other's orders.
--
-- THE MODEL, AFTER THIS
--
--   * A row with user_id IS NOT NULL is an ACCOUNT. It belongs to exactly one
--     auth user (enforced by the partial unique index below) and is only ever
--     written by that user.
--   * A row with user_id IS NULL is a GUEST record, still keyed by phone.
--     Guest checkout may reuse and update these; it may never touch an
--     account row.
--
-- Identity is therefore the auth user, not the phone number. Phone becomes
-- what it always should have been: a contact detail on the order.
--
-- WHY ORDERS GET THEIR OWN CONTACT COLUMNS
--
-- Delivery details lived only on the customer row, so an order had no record
-- of where it was actually going -- editing a profile silently rewrote the
-- delivery address of every past order, and re-pointing an order between
-- customer rows (which claiming a guest order now does) would lose them
-- entirely. Orders now snapshot the details given at checkout, which is both
-- correct history and what staff need to see on the board.

BEGIN;

-- 1. Contact snapshot on the order itself ----------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_landmark text;

-- Backfill from the customer row each order is currently attached to. This
-- MUST run before the de-duplication below re-points any orders, so every
-- order captures the details it was actually placed with.
UPDATE public.orders o
SET contact_name = c.name,
    contact_phone = c.phone,
    delivery_address = c.address,
    delivery_landmark = c.landmark
FROM public.customers c
WHERE c.id = o.customer_id
  AND o.contact_name IS NULL;

-- 2. One account row per auth user -----------------------------------------
-- Duplicates are reachable today: PIN signup inserts a row for a user, and
-- linkOrderToAccount could later stamp the same user_id onto a different
-- guest row. getMyProfile does .maybeSingle() on user_id, so a duplicate
-- makes the profile lookup error out -- part of why the account panel went
-- blank for some people.
--
-- Keep the earliest row per user as canonical, move that user's orders onto
-- it, and release the rest back to being guest records rather than deleting
-- anything.
WITH ranked AS (
  SELECT id,
         user_id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
),
canonical AS (
  SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, c.keep_id
  FROM ranked r
  JOIN canonical c ON c.user_id = r.user_id
  WHERE r.rn > 1
)
UPDATE public.orders o
SET customer_id = d.keep_id
FROM dupes d
WHERE o.customer_id = d.dupe_id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM public.customers
  WHERE user_id IS NOT NULL
)
UPDATE public.customers c
SET user_id = NULL
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_unique
  ON public.customers (user_id)
  WHERE user_id IS NOT NULL;

-- 3. Guest lookups are always "by phone AND unowned" now, so index that -----
CREATE INDEX IF NOT EXISTS customers_guest_phone_idx
  ON public.customers (phone)
  WHERE user_id IS NULL;

COMMIT;

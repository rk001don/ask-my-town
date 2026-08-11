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

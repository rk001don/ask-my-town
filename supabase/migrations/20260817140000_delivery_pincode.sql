-- Capture a pincode with every delivery address.
--
-- Addresses are free text today ("Dharmapuri Main Rd"), which is enough for a
-- rider who already knows the town and nothing more than that. A pincode is
-- the smallest addition that makes an address machine-readable, and it is the
-- piece three separate things need:
--
--   * Serviceability. "Do we deliver there?" currently has no answer the app
--     can give -- an order is accepted first and sorted out on the phone
--     afterwards.
--   * A second town. locations already exists and orders already carry
--     location_id, so the missing link between "where the customer is" and
--     "which location serves them" is exactly this field.
--   * Routing and batching. Grouping a run by area needs something more
--     stable than the prose someone typed.
--
-- Nullable on purpose: every existing order predates the field, and checkout
-- must keep working for anyone who doesn't know theirs. It is validated as six
-- digits when given, never required.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_pincode text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS pincode text;

-- Six digits, or nothing. Guards against a phone number or a house number
-- being typed into the field.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_pincode_format;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_pincode_format
  CHECK (delivery_pincode IS NULL OR delivery_pincode ~ '^[1-9][0-9]{5}$');

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_pincode_format;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_pincode_format
  CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

-- Delivery runs are grouped by area, so this is the column that gets filtered.
CREATE INDEX IF NOT EXISTS orders_delivery_pincode_idx
  ON public.orders (delivery_pincode)
  WHERE delivery_pincode IS NOT NULL;

COMMIT;

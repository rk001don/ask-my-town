-- order_items needs to snapshot the price actually charged at order time.
-- Without this, editing a product's price later in /admin would make every
-- past order's displayed price silently drift from what was actually paid.
-- Historical order data must never depend on today's live product price.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);

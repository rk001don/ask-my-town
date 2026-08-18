-- A delivered order has no feedback loop today: nothing captures whether it
-- actually went well, so a bad vendor or rider only surfaces once someone
-- complains by phone -- which in a small town is also how you lose trust.
--
-- One column, not a table: a rating is a fact about the order it belongs to,
-- not an entity with its own lifecycle, and there is exactly one per order.
alter table public.orders
  add column if not exists rating smallint check (rating between 1 and 5);

comment on column public.orders.rating is
  'Customer''s 1-5 star rating, settable only once the order is delivered. Null means not yet rated.';

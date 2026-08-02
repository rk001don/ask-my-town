-- Push subscriptions are tied to a specific order, not a customer account --
-- guests (the majority of orders) have no account to attach a subscription
-- to, but they can still opt in to "notify me about this order" from the
-- tracking page itself.
CREATE TABLE public.order_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, endpoint)
);
GRANT ALL ON public.order_push_subscriptions TO service_role;
ALTER TABLE public.order_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policy at all -- writes go through the
-- subscribeToOrderPush server function (service_role), same pattern as
-- every other write path in this app. Nobody needs to read these directly.

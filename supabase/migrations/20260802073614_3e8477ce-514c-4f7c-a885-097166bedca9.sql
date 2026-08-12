CREATE TABLE IF NOT EXISTS public.order_push_subscriptions (
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
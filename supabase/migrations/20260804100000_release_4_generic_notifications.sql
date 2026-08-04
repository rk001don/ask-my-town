-- Release 4: generic notifications foundation.
-- This keeps the legacy order-only push schema in place while enabling a device-based
-- notification pipeline that can fan out order updates and future campaigns.
CREATE TABLE public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('web','android','ios')),
  topics TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_idx ON public.push_devices (user_id, last_seen_at DESC);
CREATE INDEX push_devices_platform_idx ON public.push_devices (platform, last_seen_at DESC);
GRANT ALL ON public.push_devices TO service_role;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'order_update' CHECK (type IN ('order_update','delivery_update','offer','new_category','flash_sale','maintenance','service_update','festival','emergency')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  deep_link TEXT,
  category TEXT,
  target TEXT NOT NULL DEFAULT 'everyone' CHECK (target IN ('everyone','customers','staff','admins','selected_users')),
  target_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_campaigns_status_idx ON public.notification_campaigns (status, scheduled_at);
GRANT ALL ON public.notification_campaigns TO service_role;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','pruned')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_campaign_idx ON public.notification_deliveries (campaign_id, status);
CREATE INDEX notification_deliveries_device_idx ON public.notification_deliveries (device_id, status);
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

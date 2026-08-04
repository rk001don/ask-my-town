-- Release 2: expose order totals across surfaces and add a safe cancellation trail.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_role TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (refund_status IN ('not_applicable','pending','processed','failed')),
  ADD COLUMN IF NOT EXISTS service_fee_final NUMERIC(10,2);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancellation_state_check
  CHECK (
    (status <> 'cancelled') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  );

-- Replaces the previous migration's batch-level self-claim: staff think
-- "this order is mine to deliver", not "I claimed an abstract delivery
-- batch". Assignment now lives directly on the order, reusing the existing
-- assigned_employee_id column -- dead weight since the old PIN-based
-- employee login was dropped (no FK, nothing reads/writes it today) --
-- rather than adding a second parallel assignment concept.
ALTER TABLE public.orders RENAME COLUMN assigned_employee_id TO assigned_staff_id;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_staff_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

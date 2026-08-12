-- Delivery batches already group orders by delivery window (the underlying
-- mechanism the admin panel calls "Delivery batches"), but nothing tracks
-- who's actually delivering a given trip. Add self-claim: any signed-in
-- ops/admin staff can claim an unassigned batch as themselves, and release
-- it again if plans change. This is intentionally independent of the
-- existing `riders` table (a separate, unused admin-managed roster with no
-- link to an auth account) -- self-claim needs to work for whoever is
-- actually signed into the staff console right now, with zero setup.
ALTER TABLE public.delivery_batches
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_staff_email TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

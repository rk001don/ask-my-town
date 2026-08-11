-- ============================================================================
-- Price-visibility guardrail
-- ============================================================================
-- The original CHECK only blocked a product from *claiming* a price it
-- doesn't have (show_price = true with NULL price). It never blocked the
-- opposite mistake -- hiding a real price behind "price on request" -- which
-- is exactly the ambiguity that erodes trust on a catalog page. Genuine
-- services (is_service = true) still get to hide price, since those are
-- quoted per request by design; everything else must show its price once
-- one exists.
--
-- Audit: no current seed row actually has this bug (every show_price=false
-- row already has a NULL price), so this UPDATE is a no-op today -- it's
-- here as a safety net for any row that predates this constraint.
UPDATE public.products
SET show_price = true
WHERE price IS NOT NULL AND show_price = false AND is_service = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_show_price_requires_service_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_show_price_requires_service_check
      CHECK (show_price = true OR price IS NULL OR is_service = true);
  END IF;
END $$;

-- ============================================================================
-- "Trending picks" -- a curated shelf from the existing catalog (no new
-- products), surfaced above Categories on Home and on Explore for quick
-- reordering of the items this workforce actually buys daily: self-care
-- basics, snacking, and treats.
-- ============================================================================
UPDATE public.products
SET tags = tags || ARRAY['trending']
WHERE name IN (
  'Face Wash',
  'Face Cream',
  'Body Lotion',
  'Hair Oil',
  'Deodorant',
  'Talcum Powder',
  'Sanitary Pads (Pack)',
  'Mango Juice (300 ml)',
  'KitKat Shake (300 ml)',
  'Mango Ice Cream Cone',
  'Dairy Milk (Bar)',
  'Lays (Pack)'
)
AND NOT ('trending' = ANY(tags));

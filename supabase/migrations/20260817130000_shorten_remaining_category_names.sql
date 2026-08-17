-- Three category names still overflowed a four-column phone tile.
--
-- The home grid gives a tile roughly 72px of inner width, which fits two
-- short lines. These three each contain one word longer than a line
-- ("Beverages", "Chocolates", "Documentation"), so they were cut mid-word:
-- "Juices & Beverage", "Snacks &...", "e-Seva &...".
--
-- Shortened rather than widened, for the same reason as the previous three:
-- wider tiles mean fewer categories visible without scrolling. Slugs are
-- untouched, so no link, bookmark or QR code changes.

BEGIN;

UPDATE public.categories SET name = 'Juices & Drinks' WHERE slug = 'beverages';
UPDATE public.categories SET name = 'Snacks & Sweets' WHERE slug = 'snacks';
UPDATE public.categories SET name = 'e-Seva'          WHERE slug = 'eseva';

COMMIT;

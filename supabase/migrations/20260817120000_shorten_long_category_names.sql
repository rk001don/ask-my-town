-- Shorten the three category names that don't fit a home-page tile.
--
-- The home grid is four columns on a phone, so a tile label has room for two
-- short lines. Measured against the live catalogue, exactly three names
-- overflowed it and rendered as "Pharmacy &…", which reads as unfinished
-- rather than as a name.
--
-- Shortened rather than given more room: making the tiles wider means fewer
-- categories visible without scrolling, and these three all say the same thing
-- in fewer words. The slugs are untouched, so no link or bookmark changes.

BEGIN;

UPDATE public.categories SET name = 'Food & Meals'    WHERE slug = 'food';
UPDATE public.categories SET name = 'Ice Cream'       WHERE slug = 'desserts';
UPDATE public.categories SET name = 'Pharmacy & Care' WHERE slug = 'pharmacy';

COMMIT;

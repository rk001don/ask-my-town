-- Catalog curation pass.
--
-- Findings from auditing the live catalog (12 top-level categories,
-- 45 subcategories, 226 products):
--
--   1. Three top-level categories were renamed at some point but kept their
--      original slugs, so the URL contradicts the page: /c/beauty served
--      "Pharmacy & Personal Care", /c/travel served "e-Seva & Documentation",
--      /c/stay served "Local Assistance".
--   2. Those same three kept their ORIGINAL subcategories too, so e-Seva
--      listed "Flight booking"/"Movie tickets" and Pharmacy listed "Makeup
--      essentials" -- unrelated to any product actually in them.
--   3. All 45 subcategories contain zero products. The category page renders
--      subcategories as ItemCards (add-to-cart "ask" tiles), so each one
--      appeared to be an orderable item that no one can actually fulfil.
--   4. Several products are duplicates of each other with DIFFERENT prices
--      (e.g. "Chicken Biryani" Rs180 vs "Chicken Biryani (Plate)" Rs170,
--      "Paracetamol 500mg strip" Rs25 vs "Paracetamol (Strip)" Rs20).
--   5. A batch of hand-added rows use lowercase names and no unit
--      ("Chicken rice", "Water can", "Cooking oil") next to the curated rows
--      that all follow "Name (unit)" -- so listings look inconsistent.
--   6. Medicines were listed as ordinary add-to-cart products with fixed
--      prices. MyTown is an errand runner, not a licensed pharmacy; selling
--      medicine off a menu misrepresents what actually happens and is the
--      wrong footing legally. They are converted to price-on-request errands.
--
-- Product removals are SOFT (is_available = false) whenever the product is
-- referenced by a past order, so order history keeps rendering correctly;
-- unreferenced rows are deleted outright.

-- ---------------------------------------------------------------------------
-- 1. Slugs that contradict their category name
-- ---------------------------------------------------------------------------
update public.categories set slug = 'pharmacy' where slug = 'beauty';
update public.categories set slug = 'eseva'    where slug = 'travel';
update public.categories set slug = 'assist'   where slug = 'stay';

-- ---------------------------------------------------------------------------
-- 2. Empty subcategories
--
-- Every one of the 45 has no products. They render as orderable tiles, and a
-- third of them describe a different business than their parent. Removing them
-- makes each category page show exactly what it can actually deliver.
-- order_items stores category/subcategory as text snapshots (not foreign
-- keys), so past orders are unaffected.
-- ---------------------------------------------------------------------------
delete from public.categories c
where c.parent_id is not null
  and not exists (select 1 from public.products p where p.category_id = c.id);

-- ---------------------------------------------------------------------------
-- 3. Duplicate products
--
-- Keeps the row whose name follows the "Name (unit)" convention and whose
-- price matches the rest of its category.
-- ---------------------------------------------------------------------------
-- Duplicate names, listed once and reused by both statements below:
--   'Chicken Biryani'           -> keep "Chicken Biryani (Plate)"
--   'Chicken rice'              -> keep "Chicken Fried Rice (Plate)"
--   'Fish fry'                  -> keep "Fish 65 (Plate)"
--   'Paracetamol 500mg strip'   -> keep "Paracetamol (Strip)" in Pharmacy
--   'Phone recharge assistance' -> keep "Mobile Recharge"
--   'Ticket Booking'            -> keep the specific "Bus Ticket Booking Help"
--   'Need Anything'             -> keep "Custom Request"
--   'Lodge Booking Assistance'  -> keep "Hotel Booking Assistance"

-- Deactivate the ones that appear in order history (preserves past orders)...
update public.products p
set is_available = false, updated_at = now()
where p.name in (
        'Chicken Biryani', 'Chicken rice', 'Fish fry', 'Paracetamol 500mg strip',
        'Phone recharge assistance', 'Ticket Booking', 'Need Anything',
        'Lodge Booking Assistance')
  and exists (select 1 from public.order_items oi where oi.product_id = p.id);

-- ...and delete the ones never ordered.
delete from public.products p
where p.name in (
        'Chicken Biryani', 'Chicken rice', 'Fish fry', 'Paracetamol 500mg strip',
        'Phone recharge assistance', 'Ticket Booking', 'Need Anything',
        'Lodge Booking Assistance')
  and not exists (select 1 from public.order_items oi where oi.product_id = p.id);

-- ---------------------------------------------------------------------------
-- 4. Naming consistency
--
-- The curated catalog uses Title Case plus an explicit unit, which is what
-- makes a listing scannable ("Idli (2 pcs)" tells you what Rs15 buys).
-- These rows were added later without it.
-- ---------------------------------------------------------------------------
update public.products set name = 'Baby Care Essentials'   where name = 'Baby products';
update public.products set name = 'Cooking Oil (1 L)'      where name = 'Cooking oil';
update public.products set name = 'Detergent Powder (1 kg)' where name = 'Detergent';
update public.products set name = 'Drinking Water Can (20 L)' where name = 'Water can';
update public.products set name = 'Local Pickup & Drop'    where name = 'Local delivery';
update public.products set name = 'Tailor Pickup & Drop'   where name = 'Tailor pickup';
update public.products set name = 'Amul Milk (500 ml)'     where name = 'Amul Milk 500ml';
update public.products set name = 'Sugar (1 kg)'           where name = 'Sugar 1kg';

-- Dish names that don't say what the dish is. "Ghee Roast" on its own reads as
-- a chicken preparation in most of India; here it's the dosa.
update public.products set name = 'Ghee Roast Dosa (1 pc)' where name = 'Ghee Roast';
update public.products set name = 'Onion Dosa (1 pc)'      where name = 'Onion Dosa';
update public.products set name = 'Rava Dosa (1 pc)'       where name = 'Rava Dosa';
update public.products set name = 'Filter Coffee (150 ml)' where name = 'Filter Coffee';
update public.products set name = 'Tea (150 ml)'           where name = 'Tea';

-- ---------------------------------------------------------------------------
-- 5. Medicines: sold products -> price-on-request errands
--
-- MyTown fetches things from local shops; it does not stock or dispense
-- medicine. Listing a fixed price implies we sell it. As service items they
-- route through the same "we'll pick this up and confirm" flow as every other
-- errand, and staff can check what's actually available at the chemist.
-- ---------------------------------------------------------------------------
update public.products
set is_service  = true,
    show_price  = false,
    price       = null,
    description = coalesce(nullif(description, ''), 'We pick this up from a local pharmacy. Carry a prescription if one is required.'),
    updated_at  = now()
where name in (
  'Paracetamol (Strip)',
  'Antacid (Strip)',
  'ORS (Pack)',
  'Cough Syrup',
  'Pain Relief Spray',
  'Antiseptic Liquid (100 ml)',
  'Band-Aid (Pack)',
  'Cotton Roll',
  'Digital Thermometer',
  'Heating Patch',
  'Pregnancy Test Kit'
);

-- ---------------------------------------------------------------------------
-- 6. Top-level ordering
--
-- Ordered by how often a small town actually opens them: everyday food and
-- essentials first, planned/occasional purchases after, services last.
-- ---------------------------------------------------------------------------
update public.categories set sort_order = 1  where slug = 'food';
update public.categories set sort_order = 2  where slug = 'daily';
update public.categories set sort_order = 3  where slug = 'fruits';
update public.categories set sort_order = 4  where slug = 'beverages';
update public.categories set sort_order = 5  where slug = 'bakery';
update public.categories set sort_order = 6  where slug = 'snacks';
update public.categories set sort_order = 7  where slug = 'desserts';
update public.categories set sort_order = 8  where slug = 'cakes';
update public.categories set sort_order = 9  where slug = 'pharmacy';
update public.categories set sort_order = 10 where slug = 'assist';
update public.categories set sort_order = 11 where slug = 'eseva';
update public.categories set sort_order = 12 where slug = 'rentals';

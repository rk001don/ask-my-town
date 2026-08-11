-- Phase 3: real-world Tamil Nadu catalog curation (pricing, units, combos),
-- category icon/name fixes, and Local Assistance/Local Services consolidation.
-- Additive + corrective only: no slugs, routes, or rows are deleted, so
-- historical orders (order_items.product_id) stay intact. Superseded
-- placeholder rows are deprecated via is_available = false, never dropped.

-- ============================================================================
-- 1. Category icon fixes -- these were left stale when categories were
--    renamed in the phase2 migration (name changed, icon_key did not).
-- ============================================================================
UPDATE public.categories SET icon_key = 'pill' WHERE slug = 'beauty';
UPDATE public.categories SET icon_key = 'file-text' WHERE slug = 'travel';
UPDATE public.categories SET icon_key = 'heart-handshake' WHERE slug = 'stay';
UPDATE public.categories SET icon_key = 'moon' WHERE slug = 'food-dinner';
UPDATE public.categories SET icon_key = 'cooking-pot' WHERE slug = 'food-rice-chinese';
UPDATE public.categories SET icon_key = 'drumstick' WHERE slug = 'food-side-dishes';
UPDATE public.categories SET icon_key = 'soup' WHERE slug = 'food-curries';

-- ============================================================================
-- 2. Clearer names
-- ============================================================================
UPDATE public.categories SET name = 'Curry & Gravies' WHERE slug = 'food-curries';
UPDATE public.categories SET name = 'Ice Cream & Desserts' WHERE slug = 'desserts';
UPDATE public.categories SET name = 'Snacks & Chocolates' WHERE slug = 'snacks';

-- ============================================================================
-- 3. Consolidate "Local Services" into "Local Assistance" -- these were two
--    near-duplicate top-level tiles with overlapping content, which is the
--    kind of category clutter that hurts conversion. Move its products under
--    Local Assistance and demote the row itself to a child so it stops
--    showing as its own top-level tile. Nothing is deleted.
-- ============================================================================
UPDATE public.products
SET category_id = (SELECT id FROM public.categories WHERE slug = 'stay')
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'services');

UPDATE public.categories
SET parent_id = (SELECT id FROM public.categories WHERE slug = 'stay'), sort_order = 99
WHERE slug = 'services';

UPDATE public.products SET name = 'Parcel Pickup / Courier Drop'
WHERE name = 'Courier Pickup' AND category_id = (SELECT id FROM public.categories WHERE slug = 'stay');

-- ============================================================================
-- 4. Deprecate vague/unpriced rows that are now superseded by a specific,
--    priced equivalent below. is_available = false keeps them out of the
--    customer catalog without breaking any historical order reference.
-- ============================================================================
UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
  AND name IN ('Dosa', 'Poori set', 'Parotta', 'Chicken noodles', 'Tea or coffee');

UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'daily' AND parent_id IS NULL)
  AND name IN ('Eggs', 'Bread', 'Band-Aid / basic first aid', 'Women''s essentials', 'Soap, shampoo or toothpaste');

UPDATE public.products SET is_available = false
WHERE category_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
  AND name = 'Kothu Parotta (Plate)';

-- ============================================================================
-- 5. Price/name corrections on existing rows to match real Tamil Nadu pricing
-- ============================================================================
UPDATE public.products SET name = 'Idli (2 pcs)', price = 15 WHERE name = 'Idli (2 pcs)';
UPDATE public.products SET name = 'Mini Idli (14 pcs)', price = 40 WHERE name = 'Mini Idli (14 pcs)';
UPDATE public.products SET price = 40 WHERE name = 'Dosa (1 pc)';
UPDATE public.products SET price = 60 WHERE name = 'Masala Dosa (1 pc)';
UPDATE public.products SET price = 50, tags = ARRAY['lunch','popular'] WHERE name = 'Chicken Meals (Plate)';
UPDATE public.products SET price = 150 WHERE name = 'Chicken Meals (Plate)';
UPDATE public.products SET price = 50 WHERE name = 'Lemon Rice (Plate)';
UPDATE public.products SET price = 50 WHERE name = 'Tomato Rice (Plate)';
UPDATE public.products SET price = 170, tags = ARRAY['lunch','popular'] WHERE name = 'Chicken Biryani (Plate)';

-- ============================================================================
-- 6. New products -- Breakfast (6 AM - 11 AM), all served with sambar +
--    coconut chutney unless noted.
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Ghee Idli (2 pcs)', 'Idli finished with ghee. Served with sambar & coconut chutney.', 35::numeric, true, 7, ARRAY['breakfast']),
  ('Kal Dosa (2 pcs)', 'Soft thick dosa. Served with sambar & coconut chutney.', 50::numeric, true, 8, ARRAY['breakfast']),
  ('Onion Dosa', 'Crisp dosa topped with onion. Served with chutney.', 55::numeric, true, 9, ARRAY['breakfast']),
  ('Rava Dosa', 'Crisp semolina dosa. Served with chutney.', 65::numeric, true, 10, ARRAY['breakfast']),
  ('Ghee Roast', 'Extra-crisp dosa roasted in ghee.', 70::numeric, true, 11, ARRAY['breakfast']),
  ('Vada (1 pc)', 'Crisp fried lentil vada.', 12::numeric, true, 12, ARRAY['breakfast']),
  ('Medu Vada (2 pcs)', 'Classic medu vada pair. Served with sambar & chutney.', 25::numeric, true, 13, ARRAY['breakfast']),
  ('Omelette (2 Eggs)', 'Two-egg omelette.', 30::numeric, false, 14, ARRAY['breakfast']),
  ('Boiled Egg', 'Single boiled egg.', 10::numeric, false, 15, ARRAY['breakfast']),
  ('Filter Coffee', 'Fresh filter coffee.', 15::numeric, true, 16, ARRAY['breakfast','popular']),
  ('Tea', 'Hot tea.', 10::numeric, true, 17, ARRAY['breakfast','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 7. New products -- Lunch
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Mini Meals (Plate)', 'Smaller veg meals plate.', 70::numeric, true, 15, ARRAY['lunch']),
  ('Fish Meals (Plate)', 'Meals plate with fish gravy, subject to availability.', 170::numeric, false, 16, ARRAY['lunch']),
  ('Tamarind Rice (Plate)', 'Puliyodharai-style tamarind rice.', 50::numeric, true, 17, ARRAY['lunch']),
  ('Kuska (Plate)', 'Plain biryani rice with raita.', 70::numeric, true, 18, ARRAY['lunch']),
  ('Veg Biryani (Plate)', 'Vegetable biryani with raita.', 110::numeric, true, 19, ARRAY['lunch','popular']),
  ('Mutton Biryani (Plate)', 'Mutton biryani, subject to availability.', 260::numeric, false, 20, ARRAY['lunch'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 8. New products -- Dinner
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Veg Kothu Parotta (Plate)', 'Chopped parotta stir-fried with vegetables.', 90::numeric, true, 24, ARRAY['dinner','popular']),
  ('Egg Kothu Parotta (Plate)', 'Chopped parotta stir-fried with egg.', 110::numeric, false, 25, ARRAY['dinner','popular']),
  ('Chicken Kothu Parotta (Plate)', 'Chopped parotta stir-fried with chicken.', 140::numeric, false, 26, ARRAY['dinner','popular']),
  ('Butter Naan (2 pcs)', 'Soft naan finished with butter.', 70::numeric, true, 27, ARRAY['dinner']),
  ('Tandoori Roti (2 pcs)', 'Whole-wheat tandoori roti.', 60::numeric, true, 28, ARRAY['dinner'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 9. New products -- Curry & Gravies (bowls, add to any meal/parotta/chapati)
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Veg Kurma (Bowl)', 'Mixed vegetable kurma.', 60::numeric, true, 50, ARRAY['curries','popular']),
  ('Chicken Kurma (Bowl)', 'Chicken kurma gravy.', 100::numeric, false, 51, ARRAY['curries','popular']),
  ('Chettinad Chicken Curry (Bowl)', 'Spicy Chettinad-style chicken curry.', 110::numeric, false, 52, ARRAY['curries']),
  ('Kadai Chicken (Bowl)', 'Kadai-style chicken curry.', 110::numeric, false, 53, ARRAY['curries']),
  ('Butter Chicken (Bowl)', 'Creamy butter chicken gravy.', 130::numeric, false, 54, ARRAY['curries']),
  ('Paneer Butter Masala (Bowl)', 'Paneer in a creamy tomato gravy.', 110::numeric, true, 55, ARRAY['curries']),
  ('Dal Fry (Bowl)', 'Tempered dal.', 50::numeric, true, 56, ARRAY['curries'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 10. New products -- Rice & Chinese
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Mushroom Fried Rice (Plate)', 'Restaurant-style mushroom fried rice.', 100::numeric, true, 35, ARRAY['rice-chinese']),
  ('Gobi Fried Rice (Plate)', 'Restaurant-style cauliflower fried rice.', 90::numeric, true, 36, ARRAY['rice-chinese']),
  ('Veg Noodles (Plate)', 'Restaurant-style vegetable noodles.', 90::numeric, true, 37, ARRAY['rice-chinese']),
  ('Mushroom Noodles (Plate)', 'Restaurant-style mushroom noodles.', 100::numeric, true, 38, ARRAY['rice-chinese']),
  ('Gobi Noodles (Plate)', 'Restaurant-style cauliflower noodles.', 90::numeric, true, 39, ARRAY['rice-chinese'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 11. New products -- Side Dishes
-- ============================================================================
WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT food.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM food CROSS JOIN (VALUES
  ('Pepper Chicken (Plate)', 'Pepper chicken dry side dish.', 130::numeric, false, 43, ARRAY['side-dishes']),
  ('Dragon Chicken (Plate)', 'Indo-Chinese dragon chicken.', 140::numeric, false, 44, ARRAY['side-dishes']),
  ('Gobi Manchurian (Plate)', 'Crispy cauliflower Manchurian.', 90::numeric, true, 45, ARRAY['side-dishes']),
  ('Mushroom Manchurian (Plate)', 'Crispy mushroom Manchurian.', 100::numeric, true, 46, ARRAY['side-dishes']),
  ('Paneer Manchurian (Plate)', 'Crispy paneer Manchurian.', 110::numeric, true, 47, ARRAY['side-dishes']),
  ('Egg Masala (Plate)', 'Boiled eggs in a spiced masala gravy.', 90::numeric, false, 48, ARRAY['side-dishes']),
  ('French Fries (Plate)', 'Crispy salted fries.', 70::numeric, true, 49, ARRAY['side-dishes','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = food.id);

-- ============================================================================
-- 12. Beverages -- juices, milkshakes, soft drinks together under one tile
-- ============================================================================
WITH bev AS (SELECT id FROM public.categories WHERE slug = 'beverages')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT bev.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM bev CROSS JOIN (VALUES
  ('Apple Juice (300 ml)', 'Fresh apple juice.', 45::numeric, 10, ARRAY['juice']),
  ('Orange Juice (300 ml)', 'Fresh orange juice.', 45::numeric, 11, ARRAY['juice']),
  ('Sweet Lime Juice (300 ml)', 'Fresh sweet lime (mosambi) juice.', 40::numeric, 12, ARRAY['juice','popular']),
  ('Pineapple Juice (300 ml)', 'Fresh pineapple juice.', 40::numeric, 13, ARRAY['juice']),
  ('Grape Juice (300 ml)', 'Fresh grape juice.', 45::numeric, 14, ARRAY['juice']),
  ('Mango Juice (300 ml)', 'Fresh mango juice, seasonal.', 50::numeric, 15, ARRAY['juice','popular']),
  ('Pomegranate Juice (300 ml)', 'Fresh pomegranate juice.', 60::numeric, 16, ARRAY['juice']),
  ('Mixed Fruit Juice (300 ml)', 'Mixed seasonal fruit juice.', 45::numeric, 17, ARRAY['juice']),
  ('Lemon Juice (300 ml)', 'Fresh lemon juice / nannari.', 30::numeric, 18, ARRAY['juice']),
  ('KitKat Shake (300 ml)', 'KitKat milkshake.', 85::numeric, 20, ARRAY['shake','popular']),
  ('Vanilla Shake (300 ml)', 'Vanilla milkshake.', 75::numeric, 21, ARRAY['shake']),
  ('Strawberry Shake (300 ml)', 'Strawberry milkshake.', 80::numeric, 22, ARRAY['shake']),
  ('Mango Shake (300 ml)', 'Mango milkshake, seasonal.', 80::numeric, 23, ARRAY['shake']),
  ('Butterscotch Shake (300 ml)', 'Butterscotch milkshake.', 80::numeric, 24, ARRAY['shake']),
  ('Sprite (250 ml)', 'Subject to availability.', 20::numeric, 30, ARRAY['soft-drink']),
  ('Fanta (250 ml)', 'Subject to availability.', 20::numeric, 31, ARRAY['soft-drink']),
  ('Maaza (250 ml)', 'Subject to availability.', 20::numeric, 32, ARRAY['soft-drink']),
  ('Slice (250 ml)', 'Subject to availability.', 20::numeric, 33, ARRAY['soft-drink']),
  ('7UP (250 ml)', 'Subject to availability.', 20::numeric, 34, ARRAY['soft-drink']),
  ('Limca (250 ml)', 'Subject to availability.', 20::numeric, 35, ARRAY['soft-drink']),
  ('Red Bull (250 ml)', 'Subject to availability.', 125::numeric, 36, ARRAY['soft-drink'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = bev.id);

-- ============================================================================
-- 13. Bakery -- rolls, puffs, bakery snacks
-- ============================================================================
WITH bakery AS (SELECT id FROM public.categories WHERE slug = 'bakery')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT bakery.id, p.name, p.description, p.price, true, p.is_veg, false, true, p.sort_order, p.tags
FROM bakery CROSS JOIN (VALUES
  ('Mushroom Puff (1 pc)', 'Bakery mushroom puff.', 30::numeric, true, 4, ARRAY['bakery']),
  ('Veg Roll (1 pc)', 'Bakery vegetable roll.', 30::numeric, true, 5, ARRAY['bakery']),
  ('Chicken Roll (1 pc)', 'Bakery chicken roll.', 45::numeric, false, 6, ARRAY['bakery']),
  ('Cream Bun (1 pc)', 'Sweet cream bun.', 25::numeric, true, 7, ARRAY['bakery']),
  ('Donut (1 pc)', 'Glazed donut.', 35::numeric, true, 8, ARRAY['bakery']),
  ('Brownie (1 pc)', 'Chocolate brownie.', 45::numeric, true, 9, ARRAY['bakery','popular'])
) AS p(name, description, price, is_veg, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = bakery.id);

-- ============================================================================
-- 14. Cakes -- more flavours + weight variants
-- ============================================================================
WITH cakes AS (SELECT id FROM public.categories WHERE slug = 'cakes')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT cakes.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM cakes CROSS JOIN (VALUES
  ('Black Forest Cake (1 kg)', 'Bakery cake; freshness and availability confirmed.', 850::numeric, 2, ARRAY['cakes']),
  ('White Forest Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 480::numeric, 3, ARRAY['cakes']),
  ('Red Velvet Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 550::numeric, 4, ARRAY['cakes','popular']),
  ('Chocolate Truffle Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 550::numeric, 5, ARRAY['cakes','popular']),
  ('Butterscotch Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 480::numeric, 6, ARRAY['cakes']),
  ('Pineapple Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 450::numeric, 7, ARRAY['cakes'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = cakes.id);

-- ============================================================================
-- 15. Ice Cream & Desserts -- previously an empty category
-- ============================================================================
WITH desserts AS (SELECT id FROM public.categories WHERE slug = 'desserts')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT desserts.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM desserts CROSS JOIN (VALUES
  ('Vanilla Ice Cream (Cup)', 'Classic vanilla cup.', 30::numeric, 1, ARRAY['ice-cream']),
  ('Chocolate Ice Cream (Cup)', 'Chocolate cup.', 35::numeric, 2, ARRAY['ice-cream']),
  ('Butterscotch Ice Cream (Cup)', 'Butterscotch cup.', 35::numeric, 3, ARRAY['ice-cream']),
  ('Black Currant Ice Cream (Cup)', 'Black currant cup.', 35::numeric, 4, ARRAY['ice-cream']),
  ('Mango Ice Cream Cone', 'Mango cone, seasonal.', 40::numeric, 5, ARRAY['ice-cream','popular']),
  ('Ice Cream Family Pack (700 ml)', 'Family pack tub, flavour confirmed before delivery.', 180::numeric, 6, ARRAY['ice-cream','popular'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = desserts.id);

-- ============================================================================
-- 16. Snacks & Chocolates -- previously an empty category
-- ============================================================================
WITH snacks AS (SELECT id FROM public.categories WHERE slug = 'snacks')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT snacks.id, p.name, p.description, p.price, true, true, false, false, p.sort_order, p.tags
FROM snacks CROSS JOIN (VALUES
  ('Dairy Milk (Bar)', 'Subject to availability.', 40::numeric, 1, ARRAY['chocolate','popular']),
  ('KitKat (Bar)', 'Subject to availability.', 25::numeric, 2, ARRAY['chocolate']),
  ('Perk (Bar)', 'Subject to availability.', 10::numeric, 3, ARRAY['chocolate']),
  ('Five Star (Bar)', 'Subject to availability.', 10::numeric, 4, ARRAY['chocolate']),
  ('Munch (Bar)', 'Subject to availability.', 10::numeric, 5, ARRAY['chocolate']),
  ('Lays (Pack)', 'Subject to availability.', 20::numeric, 6, ARRAY['snack','popular']),
  ('Bingo (Pack)', 'Subject to availability.', 20::numeric, 7, ARRAY['snack']),
  ('Kurkure (Pack)', 'Subject to availability.', 20::numeric, 8, ARRAY['snack']),
  ('Good Day (Pack)', 'Subject to availability.', 30::numeric, 9, ARRAY['snack']),
  ('Oreo (Pack)', 'Subject to availability.', 30::numeric, 10, ARRAY['snack'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = snacks.id);

-- ============================================================================
-- 17. Fruits -- unit varies by fruit (kg / dozen / piece), as it should
-- ============================================================================
WITH fruits AS (SELECT id FROM public.categories WHERE slug = 'fruits')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT fruits.id, p.name, p.description, p.price, true, true, false, true, p.sort_order, p.tags
FROM fruits CROSS JOIN (VALUES
  ('Orange (1 kg)', 'Fresh orange by weight.', 100::numeric, 3, ARRAY['fruits']),
  ('Pomegranate (1 kg)', 'Fresh pomegranate by weight.', 160::numeric, 4, ARRAY['fruits']),
  ('Sweet Lime (1 kg)', 'Fresh sweet lime by weight.', 80::numeric, 5, ARRAY['fruits']),
  ('Papaya (1 pc)', 'Fresh papaya, sold whole.', 40::numeric, 6, ARRAY['fruits']),
  ('Watermelon (1 pc)', 'Fresh watermelon, sold whole.', 60::numeric, 7, ARRAY['fruits','popular']),
  ('Pineapple (1 pc)', 'Fresh pineapple, sold whole.', 50::numeric, 8, ARRAY['fruits']),
  ('Grapes (1 kg)', 'Fresh grapes by weight.', 90::numeric, 9, ARRAY['fruits'])
) AS p(name, description, price, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = fruits.id);

-- ============================================================================
-- 18. Pharmacy & Personal Care -- OTC medicines, women's essentials, personal care
-- ============================================================================
WITH beauty AS (SELECT id FROM public.categories WHERE slug = 'beauty')
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT beauty.id, p.name, p.description, p.price, p.show_price, NULL, false, p.schedulable, p.sort_order, p.tags
FROM beauty CROSS JOIN (VALUES
  ('Paracetamol (Strip)', 'OTC pain/fever relief. Availability confirmed before delivery.', 20::numeric, true, false, 10, ARRAY['medicine']),
  ('ORS (Pack)', 'Oral rehydration salts.', 25::numeric, true, false, 11, ARRAY['medicine']),
  ('Cotton Roll', 'Absorbent cotton roll.', 35::numeric, true, false, 12, ARRAY['first-aid']),
  ('Antiseptic Liquid (100 ml)', 'Wound antiseptic, brand confirmed before delivery.', 60::numeric, true, false, 13, ARRAY['first-aid']),
  ('Pain Relief Spray', 'Topical pain relief spray.', 110::numeric, true, false, 14, ARRAY['medicine']),
  ('Cough Syrup', 'OTC cough syrup, brand confirmed before delivery.', 90::numeric, true, false, 15, ARRAY['medicine']),
  ('Antacid (Strip)', 'OTC antacid tablets.', 25::numeric, true, false, 16, ARRAY['medicine']),
  ('Digital Thermometer', 'Digital body thermometer.', 150::numeric, true, false, 17, ARRAY['medicine']),
  ('Tampons (Pack)', 'Discreet pickup and delivery.', 150::numeric, true, false, 20, ARRAY['womens-essentials']),
  ('Panty Liners (Pack)', 'Discreet pickup and delivery.', 60::numeric, true, false, 21, ARRAY['womens-essentials']),
  ('Pregnancy Test Kit', 'Discreet pickup and delivery.', 60::numeric, true, false, 22, ARRAY['womens-essentials']),
  ('Heating Patch', 'Cramp-relief heating patch.', 40::numeric, true, false, 23, ARRAY['womens-essentials']),
  ('Shampoo (Sachet/Bottle)', 'Brand and size confirmed before delivery.', 50::numeric, true, true, 30, ARRAY['personal-care']),
  ('Soap (Bar)', 'Brand confirmed before delivery.', 40::numeric, true, true, 31, ARRAY['personal-care']),
  ('Face Wash', 'Brand confirmed before delivery.', 90::numeric, true, true, 32, ARRAY['personal-care']),
  ('Toothpaste', 'Brand confirmed before delivery.', 55::numeric, true, true, 33, ARRAY['personal-care']),
  ('Toothbrush', 'Standard toothbrush.', 25::numeric, true, true, 34, ARRAY['personal-care']),
  ('Deodorant', 'Brand confirmed before delivery.', 180::numeric, true, true, 35, ARRAY['personal-care']),
  ('Body Lotion', 'Brand confirmed before delivery.', 150::numeric, true, true, 36, ARRAY['personal-care']),
  ('Face Cream', 'Brand confirmed before delivery.', 120::numeric, true, true, 37, ARRAY['personal-care']),
  ('Hair Oil', 'Brand confirmed before delivery.', 90::numeric, true, true, 38, ARRAY['personal-care']),
  ('Talcum Powder', 'Brand confirmed before delivery.', 80::numeric, true, true, 39, ARRAY['personal-care'])
) AS p(name, description, price, show_price, schedulable, sort_order, tags)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = beauty.id);

-- ============================================================================
-- 19. e-Seva & Documentation -- service items, price confirmed on request
-- ============================================================================
WITH eseva AS (SELECT id FROM public.categories WHERE slug = 'travel')
INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
SELECT eseva.id, p.name, p.description, NULL, false, true, true, p.sort_order, ARRAY['eseva']
FROM eseva CROSS JOIN (VALUES
  ('Aadhaar Update Assistance', 'Help with Aadhaar detail updates. Service fee shown before you order.', 10),
  ('PAN Card Services', 'New PAN / correction assistance.', 11),
  ('Passport Appointment Help', 'Appointment booking assistance.', 12),
  ('Driving Licence Services', 'DL application/renewal assistance.', 13),
  ('Voter ID Services', 'Voter ID application/correction assistance.', 14),
  ('Income Certificate', 'Application assistance.', 15),
  ('Community Certificate', 'Application assistance.', 16),
  ('Nativity Certificate', 'Application assistance.', 17),
  ('Birth Certificate', 'Application assistance.', 18),
  ('Death Certificate', 'Application assistance.', 19),
  ('Pension Assistance', 'Pension-related application help.', 20),
  ('EB Bill Payment', 'Electricity bill payment on your behalf.', 21),
  ('Water Bill Payment', 'Water bill payment on your behalf.', 22),
  ('DTH Recharge', 'Share operator and amount.', 23),
  ('Ticket Booking', 'Bus/train/movie ticket booking assistance.', 24),
  ('Government Form Filling', 'Form filling assistance for government portals.', 25),
  ('Online Application Help', 'General online application assistance.', 26),
  ('Printout / Xerox', 'Document printing and photocopying.', 27),
  ('Spiral Binding', 'Document spiral binding.', 28),
  ('Passport Photo', 'Passport-size photo service.', 29)
) AS p(name, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = eseva.id);

-- ============================================================================
-- 20. Rentals -- bicycle & two-wheeler only, per current business scope
-- ============================================================================
WITH rentals AS (SELECT id FROM public.categories WHERE slug = 'rentals')
INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
SELECT rentals.id, p.name, p.description, p.price, true, true, true, p.sort_order, ARRAY['rental']
FROM rentals CROSS JOIN (VALUES
  ('Bicycle Rental (Hourly)', 'ID proof required at pickup.', 15::numeric, 1),
  ('Bicycle Rental (Daily)', 'ID proof required at pickup.', 80::numeric, 2),
  ('Two-Wheeler Rental (Hourly)', 'ID proof and driving licence required. Fuel extra.', 40::numeric, 3),
  ('Two-Wheeler Rental (Daily)', 'ID proof and driving licence required. Fuel extra.', 250::numeric, 4)
) AS p(name, description, price, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = rentals.id);

-- Prices and new items sourced from a photographed menu booklet ("Pizza Duke")
-- the owner shared, cross-checked frame by frame against the live catalogue.
--
-- Two kinds of change:
--   1. UPDATE: items we already sell (juices, shakes, ice cream) where the
--      booklet's real price differs from ours.
--   2. INSERT: items the booklet has that we don't sell at all (pizza,
--      burgers, sandwiches, fried chicken, lassi, milk drinks, fruit salad).
--
-- Only prices that were clearly legible in the video are included here.
-- Several sections (Bucket Chicken, Strips, Popcorn Chicken, Buns, Mojito,
-- French Fries, and a handful of Fresh Juice rows) had their price column run
-- off the edge of every frame the camera caught -- not blurry, never in
-- shot -- so nothing for those is invented; they're simply not added.
--
-- is_veg is left NULL (shows in neither the "Veg only" nor "Non-veg only"
-- filter, but still in the unfiltered view) wherever the name doesn't say
-- definitively -- e.g. "SPL Burger", "Cheese Blast Burger", "Korean Hot
-- Burger" could be either. Guessing wrong here is a real correctness bug
-- (a chicken item appearing under "Veg only"), so unclear stays unclear.

-- ============================================================================
-- 1. Price updates -- items we already sell, real price from the booklet
-- ============================================================================

update public.products set price = 50.00 where name = 'Orange Juice (300 ml)';
update public.products set price = 50.00 where name = 'Grape Juice (300 ml)';
update public.products set price = 70.00 where name = 'Pomegranate Juice (300 ml)';
-- Mosambi is the Tamil/Hindi name for sweet lime -- same fruit, our product name.
update public.products set price = 50.00 where name = 'Sweet Lime Juice (300 ml)';
update public.products set price = 80.00 where name = 'Vanilla Shake (300 ml)';

-- ============================================================================
-- 2. Pizza -- new to the catalogue (Food & Meals)
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Margherita Pizza',        'Classic cheese and tomato, no toppings.',        99.00,  true,  57, array['pizza']),
  ('Cheese Corn Pizza',       'Loaded with sweet corn and extra cheese.',       119.00, true,  58, array['pizza']),
  ('Veg Loaded Pizza',        'Mixed vegetables, generously topped.',           129.00, true,  59, array['pizza']),
  ('Paneer Tikka Pizza',      'Tandoori paneer chunks, smoky and spiced.',      149.00, true,  60, array['pizza']),
  ('Farmhouse Pizza',         'Onion, capsicum, tomato and mushroom.',          149.00, true,  61, array['pizza']),
  ('Peri Peri Paneer Pizza',  'Paneer with a peri peri kick.',                  159.00, true,  62, array['pizza']),
  ('Chicken Loaded Pizza',    'Piled high with chicken toppings.',              169.00, false, 63, array['pizza']),
  ('Chicken Peri Peri Pizza', 'Chicken with a peri peri kick.',                 189.00, false, 64, array['pizza'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'food'
  and not exists (select 1 from public.products x where x.name = p.name);

-- ============================================================================
-- 3. Burger -- new to the catalogue (Food & Meals)
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Crunchy Chicken Burger',      'Crispy fried chicken patty, classic bun.',   80.00,  false, 65, array['burger']),
  ('Red Hot Chicken Burger',      'Spicy chicken patty with a fiery kick.',     80.00,  false, 66, array['burger']),
  ('SPL Burger',                  'The house special, loaded.',                 90.00,  null,  67, array['burger']),
  ('Cheese Blast Burger',         'Extra cheese, melted through.',              90.00,  null,  68, array['burger']),
  ('Paneer Cheese Burger',        'Paneer patty with melted cheese.',           100.00, true,  69, array['burger']),
  ('Korean Hot Burger',           'Korean-style spicy glaze.',                  90.00,  null,  70, array['burger']),
  ('Veg Cheese Burger',           'Veg patty with melted cheese.',              90.00,  true,  71, array['burger']),
  ('No Bun Burger',               'All the filling, no bread.',                 90.00,  null,  72, array['burger']),
  ('No Bun Hot Cheese Burger',    'No bread, extra cheese, spiced up.',         100.00, null,  73, array['burger'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'food'
  and not exists (select 1 from public.products x where x.name = p.name);

-- ============================================================================
-- 4. Sandwich -- new to the catalogue (Food & Meals)
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Chicken Sandwich',        'Grilled chicken filling, toasted.',      70.00, false, 74, array['sandwich']),
  ('Paneer Sandwich',         'Grilled paneer filling, toasted.',       70.00, true,  75, array['sandwich']),
  ('Fried Chicken Sandwich',  'Crispy fried chicken, toasted.',         70.00, false, 76, array['sandwich']),
  ('Egg Cheese Sandwich',     'Egg and melted cheese, toasted.',        70.00, false, 77, array['sandwich']),
  ('Red Hot Chicken Sandwich','Spicy chicken filling, toasted.',        80.00, false, 78, array['sandwich']),
  ('SPL Sandwich',            'The house special, toasted.',            70.00, null,  79, array['sandwich'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'food'
  and not exists (select 1 from public.products x where x.name = p.name);

-- ============================================================================
-- 5. Fried Chicken -- new to the catalogue (Food & Meals)
--
-- The piece-count labels (2/4/6/8) on the leg-piece and lollipop rows were
-- the least legible part of the whole video -- small italic text at a
-- shallow angle. This is the best reading across every frame checked; if
-- it's wrong, it's the count in the name, not the price next to it.
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Fried Chicken (2 pcs)',    'Crispy fried chicken leg pieces.', 160.00, false, 80, array['fried chicken']),
  ('Fried Chicken (4 pcs)',    'Crispy fried chicken leg pieces.', 300.00, false, 81, array['fried chicken']),
  ('Chicken Lollipop (6 pcs)', 'Fried chicken lollipops.',         100.00, false, 82, array['fried chicken']),
  ('Chicken Lollipop (8 pcs)', 'Fried chicken lollipops.',         200.00, false, 83, array['fried chicken'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'food'
  and not exists (select 1 from public.products x where x.name = p.name);

-- ============================================================================
-- 6. Lassi & Milk drinks -- new to the catalogue (Juices & Drinks)
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Black Current Lassi', 'Thick lassi, black currant flavour.', 90.00, true, 37, array['lassi']),
  ('Mango Lassi',         'Thick lassi, mango flavour.',         90.00, true, 38, array['lassi']),
  ('Butter Scotch Lassi', 'Thick lassi, butterscotch flavour.',  80.00, true, 39, array['lassi']),
  ('Pista Lassi',         'Thick lassi, pistachio flavour.',     80.00, true, 40, array['lassi']),
  ('Chocolate Lassi',     'Thick lassi, chocolate flavour.',     80.00, true, 41, array['lassi']),
  ('Strawberry Lassi',    'Thick lassi, strawberry flavour.',    70.00, true, 42, array['lassi']),
  ('Normal Lassi',        'Classic sweet lassi.',                50.00, true, 43, array['lassi']),
  ('Cold Badam Milk',     'Chilled almond milk.',                50.00, true, 44, array['milk']),
  ('Hot Badam Milk',      'Warm almond milk.',                   50.00, true, 45, array['milk']),
  ('Rose Milk',           'Chilled milk, rose syrup.',           40.00, true, 46, array['milk']),
  ('Strawberry Milk',     'Chilled milk, strawberry flavour.',   40.00, true, 47, array['milk']),
  ('Pista Milk',          'Chilled milk, pistachio flavour.',    40.00, true, 48, array['milk'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'beverages'
  and not exists (select 1 from public.products x where x.name = p.name);

-- ============================================================================
-- 7. Fruit Salad -- new to the catalogue (Ice Cream)
-- ============================================================================

insert into public.products
  (category_id, name, description, price, is_veg, sort_order, tags)
select c.id, p.name, p.description, p.price, p.is_veg, p.sort_order, p.tags
from public.categories c
cross join (values
  ('Butter Scotch Fruit Salad',    'Fresh fruit, butterscotch topping.',    120.00, true, 7,  array['fruit salad']),
  ('Black Current Fruit Salad',    'Fresh fruit, black currant topping.',   120.00, true, 8,  array['fruit salad']),
  ('Fruit Salad & Ice Cream',      'Fresh fruit with a scoop of ice cream.',120.00, true, 9,  array['fruit salad']),
  ('Chocolate Fruit Salad',        'Fresh fruit, chocolate topping.',       120.00, true, 10, array['fruit salad']),
  ('Vanilla Fruit Salad',          'Fresh fruit, vanilla topping.',         120.00, true, 11, array['fruit salad']),
  ('Strawberry Fruit Salad',       'Fresh fruit, strawberry topping.',      120.00, true, 12, array['fruit salad']),
  ('Pista Fruit Salad',            'Fresh fruit, pistachio topping.',       60.00,  true, 13, array['fruit salad']),
  ('Normal Fruit Salad',           'Fresh seasonal fruit, no topping.',     60.00,  true, 14, array['fruit salad'])
) as p(name, description, price, is_veg, sort_order, tags)
where c.slug = 'desserts'
  and not exists (select 1 from public.products x where x.name = p.name);

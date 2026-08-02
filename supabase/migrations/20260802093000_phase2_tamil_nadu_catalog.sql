-- Phase 2 catalog curation for semi-urban Tamil Nadu buying behaviour.
-- Additive/reordering migration: preserves existing slugs, routes, products, cart, checkout, and admin flows.

UPDATE public.categories
SET name = CASE slug
  WHEN 'daily' THEN 'Daily Essentials'
  WHEN 'beauty' THEN 'Pharmacy & Personal Care'
  WHEN 'travel' THEN 'e-Seva & Documentation'
  WHEN 'stay' THEN 'Local Assistance'
  ELSE name
END,
sort_order = CASE slug
  WHEN 'food' THEN 1
  WHEN 'daily' THEN 2
  WHEN 'beauty' THEN 3
  WHEN 'travel' THEN 4
  WHEN 'stay' THEN 5
  WHEN 'services' THEN 13
  WHEN 'rentals' THEN 6
  ELSE sort_order
END
WHERE parent_id IS NULL;

WITH desired(name, slug, icon_key, sort_order) AS (
  VALUES
    ('Bakery', 'bakery', 'croissant', 7),
    ('Juices & Beverages', 'beverages', 'glass-water', 8),
    ('Desserts', 'desserts', 'ice-cream', 9),
    ('Cakes', 'cakes', 'cake', 10),
    ('Snacks', 'snacks', 'cookie', 11),
    ('Fruits', 'fruits', 'apple', 12)
)
INSERT INTO public.categories (name, slug, icon_key, sort_order)
SELECT name, slug, icon_key, sort_order FROM desired
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = desired.slug);

WITH food AS (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL),
desired(name, slug, icon_key, sort_order) AS (
  VALUES
    ('Breakfast', 'food-breakfast', 'coffee', 1),
    ('Lunch', 'food-lunch', 'utensils-crossed', 2),
    ('Dinner', 'food-dinner', 'moon', 3),
    ('Rice & Chinese', 'food-rice-chinese', 'bowl-chopsticks', 4),
    ('Side Dishes', 'food-side-dishes', 'drumstick', 5),
    ('Curries', 'food-curries', 'soup', 6)
)
INSERT INTO public.categories (name, slug, parent_id, icon_key, sort_order)
SELECT desired.name, desired.slug, food.id, desired.icon_key, desired.sort_order
FROM desired CROSS JOIN food
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug = desired.slug);

UPDATE public.categories SET sort_order = CASE slug
  WHEN 'food-breakfast' THEN 1 WHEN 'food-tiffin' THEN 1
  WHEN 'food-lunch' THEN 2 WHEN 'food-dinner' THEN 3
  WHEN 'food-rice-chinese' THEN 4 WHEN 'food-side-dishes' THEN 5 WHEN 'food-curries' THEN 6
  ELSE sort_order END
WHERE parent_id = (SELECT id FROM public.categories WHERE slug = 'food' AND parent_id IS NULL);

WITH product_seed(category_slug, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags) AS (
  VALUES
    ('food', 'Idli (2 pcs)', 'Soft steamed breakfast idli with chutney/sambar availability confirmed.', 20, true, true, false, true, 1, ARRAY['breakfast','popular']),
    ('food', 'Mini Idli (14 pcs)', 'Bite-sized mini idli breakfast portion.', 50, true, true, false, true, 2, ARRAY['breakfast','popular']),
    ('food', 'Dosa (1 pc)', 'Crispy dosa with chutney/sambar.', 45, true, true, false, true, 3, ARRAY['breakfast','popular']),
    ('food', 'Masala Dosa (1 pc)', 'Dosa with potato masala filling.', 65, true, true, false, true, 4, ARRAY['breakfast','popular']),
    ('food', 'Poori (2 pcs)', 'Poori set with masala.', 45, true, true, false, true, 5, ARRAY['breakfast','popular']),
    ('food', 'Pongal (Plate)', 'Hot ven pongal breakfast plate.', 50, true, true, false, true, 6, ARRAY['breakfast','popular']),
    ('food', 'Veg Meals (Plate)', 'Tamil Nadu veg meals plate.', 90, true, true, false, true, 10, ARRAY['lunch','popular']),
    ('food', 'Chicken Meals (Plate)', 'Meals plate with chicken gravy availability confirmed.', 140, true, false, false, true, 11, ARRAY['lunch','popular']),
    ('food', 'Curd Rice (Plate)', 'Comfort curd rice plate.', 50, true, true, false, true, 12, ARRAY['lunch','popular']),
    ('food', 'Lemon Rice (Plate)', 'Lemon rice plate for quick lunch.', 45, true, true, false, true, 13, ARRAY['lunch','popular']),
    ('food', 'Tomato Rice (Plate)', 'Tomato rice plate for quick lunch.', 45, true, true, false, true, 14, ARRAY['lunch','popular']),
    ('food', 'Chicken Biryani (Plate)', 'Local hotel chicken biryani plate.', 140, true, false, false, true, 20, ARRAY['dinner','popular']),
    ('food', 'Chapati (2 pcs)', 'Chapati set with kurma/gravy.', 40, true, true, false, true, 21, ARRAY['dinner','popular']),
    ('food', 'Parotta (2 pcs)', 'Layered parotta set with salna.', 40, true, true, false, true, 22, ARRAY['dinner','popular']),
    ('food', 'Kothu Parotta (Plate)', 'Chopped parotta plate from local hotel.', 90, true, false, false, true, 23, ARRAY['dinner','popular']),
    ('food', 'Chicken Fried Rice (Plate)', 'Restaurant-style chicken fried rice.', 120, true, false, false, true, 30, ARRAY['rice-chinese','popular']),
    ('food', 'Egg Fried Rice (Plate)', 'Restaurant-style egg fried rice.', 100, true, false, false, true, 31, ARRAY['rice-chinese','popular']),
    ('food', 'Veg Fried Rice (Plate)', 'Restaurant-style veg fried rice.', 90, true, true, false, true, 32, ARRAY['rice-chinese','popular']),
    ('food', 'Chicken Noodles (Plate)', 'Restaurant-style chicken noodles.', 120, true, false, false, true, 33, ARRAY['rice-chinese','popular']),
    ('food', 'Egg Noodles (Plate)', 'Restaurant-style egg noodles.', 100, true, false, false, true, 34, ARRAY['rice-chinese','popular']),
    ('food', 'Chicken 65 (Plate)', 'Spicy chicken 65 side dish.', 120, true, false, false, true, 40, ARRAY['side-dishes','popular']),
    ('food', 'Fish 65 (Plate)', 'Fish 65 side dish availability confirmed.', 130, true, false, false, true, 41, ARRAY['side-dishes','popular']),
    ('food', 'Chilli Chicken (Plate)', 'Chilli chicken side dish.', 130, true, false, false, true, 42, ARRAY['side-dishes','popular']),
    ('daily', 'Milk (500 ml)', 'Packet milk; brand confirmed before delivery.', 28, true, true, false, true, 1, ARRAY['daily-essentials','popular']),
    ('daily', 'Bread (400 g)', 'Fresh bread loaf; brand confirmed before delivery.', 45, true, true, false, true, 2, ARRAY['daily-essentials','popular']),
    ('daily', 'Eggs (6 pcs)', 'Fresh eggs half-dozen pack.', 45, true, false, false, true, 3, ARRAY['daily-essentials','popular']),
    ('beauty', 'Sanitary Pads (Pack)', 'Discreet pickup of sanitary pad pack.', 45, true, NULL, false, true, 1, ARRAY['personal-care','popular']),
    ('beauty', 'Band-Aid (Pack)', 'Basic adhesive bandage pack.', 30, true, NULL, false, false, 2, ARRAY['first-aid','popular']),
    ('travel', 'Mobile Recharge', 'Share operator and amount; service fee shown before order.', NULL, false, NULL, true, false, 1, ARRAY['eseva','popular']),
    ('stay', 'Hotel Booking Assistance', 'We help find and confirm nearby hotel rooms.', NULL, false, NULL, true, true, 1, ARRAY['local-assistance','popular']),
    ('stay', 'Lodge Booking Assistance', 'Local lodge availability check and booking help.', NULL, false, NULL, true, true, 2, ARRAY['local-assistance']),
    ('stay', 'Parent Assistance', 'Help parents or family members locally when you are away.', NULL, false, NULL, true, true, 3, ARRAY['local-assistance']),
    ('stay', 'Guest Pickup', 'Pickup coordination for visiting guests.', NULL, false, NULL, true, true, 4, ARRAY['local-assistance']),
    ('stay', 'Medicine Pickup', 'Pickup medicines from local pharmacy as requested.', NULL, false, NULL, true, false, 5, ARRAY['local-assistance']),
    ('stay', 'Need Anything', 'Custom local request handled by MyTown.', NULL, false, NULL, true, true, 99, ARRAY['custom','popular']),
    ('services', 'Courier Pickup', 'Small parcel or document pickup coordination.', NULL, false, NULL, true, true, 1, ARRAY['local-service']),
    ('services', 'Shopping Assistance', 'We shop locally based on your list.', NULL, false, NULL, true, true, 2, ARRAY['local-service']),
    ('services', 'Gift Delivery', 'Gift pickup and delivery coordination.', NULL, false, NULL, true, true, 3, ARRAY['local-service']),
    ('services', 'Flower Delivery', 'Flower purchase and delivery coordination.', NULL, false, NULL, true, true, 4, ARRAY['local-service']),
    ('services', 'Queue Standing', 'Queue assistance at local offices or counters.', NULL, false, NULL, true, true, 5, ARRAY['local-service']),
    ('services', 'Government Office Assistance', 'Local government-office guidance and visits.', NULL, false, NULL, true, true, 6, ARRAY['local-service']),
    ('services', 'Document Submission', 'Submit documents locally as instructed.', NULL, false, NULL, true, true, 7, ARRAY['local-service']),
    ('services', 'Translation Assistance', 'Tamil/English assistance for local tasks.', NULL, false, NULL, true, true, 8, ARRAY['local-service']),
    ('services', 'Local Guide', 'Local guidance for guests and new employees.', NULL, false, NULL, true, true, 9, ARRAY['local-service']),
    ('services', 'Custom Request', 'Tell MyTown what you need locally.', NULL, false, NULL, true, true, 10, ARRAY['local-service','popular']),
    ('bakery', 'Veg Puff (1 pc)', 'Bakery veg puff.', 20, true, true, false, true, 1, ARRAY['bakery','popular']),
    ('bakery', 'Egg Puff (1 pc)', 'Bakery egg puff.', 25, true, false, false, true, 2, ARRAY['bakery','popular']),
    ('bakery', 'Chicken Puff (1 pc)', 'Bakery chicken puff.', 35, true, false, false, true, 3, ARRAY['bakery','popular']),
    ('beverages', 'Watermelon Juice (300 ml)', 'Fresh watermelon juice.', 40, true, true, false, true, 1, ARRAY['juice','popular']),
    ('beverages', 'Oreo Shake (300 ml)', 'Oreo milkshake.', 80, true, true, false, true, 2, ARRAY['shake','popular']),
    ('beverages', 'Chocolate Shake (300 ml)', 'Chocolate milkshake.', 80, true, true, false, true, 3, ARRAY['shake','popular']),
    ('beverages', 'Coca-Cola (250 ml)', 'Coca-Cola bottle/can subject to availability.', 20, true, true, false, true, 4, ARRAY['soft-drink','popular']),
    ('beverages', 'Pepsi (250 ml)', 'Pepsi bottle/can subject to availability.', 20, true, true, false, true, 5, ARRAY['soft-drink','popular']),
    ('cakes', 'Black Forest Cake (500 g)', 'Bakery cake; freshness and availability confirmed.', 450, true, true, false, true, 1, ARRAY['cakes','popular']),
    ('fruits', 'Apple (1 kg)', 'Fresh apple by weight.', 180, true, true, false, true, 1, ARRAY['fruits']),
    ('fruits', 'Banana (1 dozen)', 'Fresh banana dozen.', 60, true, true, false, true, 2, ARRAY['fruits','popular'])
)
INSERT INTO public.products (category_id, name, description, price, show_price, is_veg, is_service, schedulable, sort_order, tags)
SELECT c.id, p.name, p.description, p.price, p.show_price, p.is_veg, p.is_service, p.schedulable, p.sort_order, p.tags
FROM product_seed p
JOIN public.categories c ON c.slug = p.category_slug AND c.parent_id IS NULL
WHERE NOT EXISTS (SELECT 1 FROM public.products existing WHERE existing.name = p.name AND existing.category_id = c.id);

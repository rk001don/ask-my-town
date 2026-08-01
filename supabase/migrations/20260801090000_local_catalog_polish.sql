-- Local catalog polish for semi-rural Karimangalam: additive seed items only.
-- Existing categories, routes, and product semantics are preserved.

INSERT INTO public.products (category_id, name, description, price, show_price, is_service, schedulable, sort_order, tags)
VALUES
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Dosa', 'Breakfast tiffin', NULL, false, false, true, 20, ARRAY['popular','breakfast']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Poori set', 'Breakfast tiffin', NULL, false, false, true, 21, ARRAY['popular','breakfast']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Parotta', 'Evening tiffin', NULL, false, false, true, 22, ARRAY['popular','dinner']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Chicken rice', 'Restaurant pickup', NULL, false, false, true, 23, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Chicken noodles', 'Restaurant pickup', NULL, false, false, true, 24, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Fish fry', 'Restaurant pickup', NULL, false, false, true, 25, ARRAY['popular','restaurant']),
((SELECT id FROM public.categories WHERE slug='food' AND parent_id IS NULL), 'Tea or coffee', 'Local shop pickup', NULL, false, false, true, 26, ARRAY['popular','beverage']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Eggs', 'Pack size confirmed before delivery', NULL, false, false, true, 20, ARRAY['popular','grocery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Bread', 'Brand confirmed before delivery', NULL, false, false, true, 21, ARRAY['popular','bakery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Cooking oil', 'Brand and size confirmed before delivery', NULL, false, false, true, 22, ARRAY['grocery']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Soap, shampoo or toothpaste', 'Daily personal essentials', NULL, false, false, true, 23, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Detergent', 'Brand and size confirmed before delivery', NULL, false, false, true, 24, ARRAY['household']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Band-Aid / basic first aid', 'Availability confirmed before delivery', NULL, false, false, false, 25, ARRAY['medicine','first-aid']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Baby products', 'Diapers, wipes and basics', NULL, false, false, true, 26, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Women''s essentials', 'Hygiene essentials with discreet delivery', NULL, false, false, true, 27, ARRAY['essentials']),
((SELECT id FROM public.categories WHERE slug='daily' AND parent_id IS NULL), 'Water can', '20L can subject to local availability', NULL, false, false, true, 28, ARRAY['popular','water']),
((SELECT id FROM public.categories WHERE slug='travel' AND parent_id IS NULL), 'Phone recharge assistance', 'Tell us operator and amount', NULL, false, true, false, 20, ARRAY['popular','utility']),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Tailor pickup', 'Alteration pickup and drop', NULL, false, true, true, 20, ARRAY['local-service']),
((SELECT id FROM public.categories WHERE slug='services' AND parent_id IS NULL), 'Local delivery', 'Documents or small parcels nearby', NULL, false, true, true, 21, ARRAY['popular','courier'])
ON CONFLICT DO NOTHING;

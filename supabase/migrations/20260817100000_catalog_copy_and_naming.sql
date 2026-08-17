-- Catalogue copy, naming and home-services pricing.
--
-- Three separate problems, all found by using the live app:
--
-- 1. "Local Help & Errands" was not understandable -- "errands" carries no
--    meaning for most of the town. Renamed to "Everyday Help", which says the
--    same thing in words people already use.
--
-- 2. Home services carried a fixed price for four of nine listings
--    (electrician, plumber, AC, cleaning) and "price on request" for the other
--    five. A plumber visit cannot honestly be priced before anyone has seen
--    the job, so the fixed number was a promise we could not keep. All nine
--    are now quoted on site.
--
-- 3. Descriptions were internal notes, not customer copy. 44 products shared
--    just four lines between them -- "Subject to availability." appeared on 17
--    cards, "Application assistance." on 5 -- so a category page read as one
--    repeated sentence. And for services the one-liner was genuinely
--    unusable: "Parent Assistance" as a bare title tells a customer nothing
--    about what would actually happen if they tapped it.
--
--    This rewrites both fields for all 231 products:
--      description       -- the card line. One sentence, 225 of the 231 now
--                           distinct (the repeats are the soft drinks, which
--                           really are the same product bar the name).
--      description_long  -- the detail sheet. Sensory and specific for food;
--                           for services, what we do, what we need from you,
--                           and how money works.

BEGIN;

-- 1. Category rename -------------------------------------------------------
UPDATE public.categories
SET name = 'Everyday Help'
WHERE slug = 'assist';

-- 2. Home services are all quote-on-site -----------------------------------
-- Scoped through the category join so this can never reach a priced retail
-- product.
UPDATE public.products p
SET price = NULL,
    show_price = false
FROM public.categories c
WHERE p.category_id = c.id
  AND c.slug = 'home-services';

-- 3. Copy ------------------------------------------------------------------
-- Matched on name: products have no stable slug, and every name is unique in
-- the catalogue (checked against all 231 live rows before writing this).
-- Rows in the migration lineage that production no longer has simply don't
-- match, which is the intended no-op.
WITH copy(product_name, card_line, body) AS (
  VALUES
  ('7UP (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('AC Service', 'AC servicing and repair at home.', 'AC servicing and repair at home.

Routine cleaning, gas top-up, cooling problems, installation and uninstallation.

Charged by unit and by what the machine actually needs, quoted before work begins.'),
  ('Aadhaar Update Assistance', 'Help with Aadhaar corrections and updates — name, address, date of birth, mobile number or biometrics.', 'Help with Aadhaar corrections and updates — name, address, date of birth, mobile number or biometrics.

We tell you which documents to carry, book the enrolment-centre slot where one is needed, and go with you if you want. Government fees are paid at the centre; our fee is shown before you order.'),
  ('Amul Milk (500 ml)', 'Amul packet milk, 500 ml.', 'Amul packet milk, 500 ml.'),
  ('Antacid (Strip)', 'Antacid tablets for acidity and indigestion, by the strip.', 'Antacid tablets for acidity and indigestion, by the strip. Brand as stocked.'),
  ('Antiseptic Liquid (100 ml)', 'Antiseptic liquid for cleaning cuts and grazes, and for diluting as directed on the label.', 'Antiseptic liquid for cleaning cuts and grazes, and for diluting as directed on the label.'),
  ('Apple (1 kg)', 'Fresh apples, about a kilo.', 'Fresh apples, about a kilo. We pick what''s good on the day rather than what''s been sitting.'),
  ('Apple Juice (300 ml)', 'Fresh apple juice, 300 ml.', 'Fresh apple juice, 300 ml.'),
  ('Appliance Repair', 'Repair for household machines — fridge, washing machine, mixer, grinder, geyser, fan.', 'Repair for household machines — fridge, washing machine, mixer, grinder, geyser, fan.

Tell us the appliance, the brand and what it''s doing. The technician diagnoses on site and quotes before repairing.'),
  ('Baby Care Essentials', 'Nappies, wipes, baby soap, powder and oil.', 'Nappies, wipes, baby soap, powder and oil.

Tell us the child''s age and the brands you use — this is one where we won''t substitute without asking you first.'),
  ('Banana (1 dozen)', 'A dozen bananas.', 'A dozen bananas. Say if you want them ripe for today or slightly green to last the week.'),
  ('Band-Aid (Pack)', 'Adhesive bandages for small cuts and blisters.', 'Adhesive bandages for small cuts and blisters. Pack size as stocked.'),
  ('Bicycle Rental (Daily)', 'A bicycle for the full day.', 'A bicycle for the full day.

ID proof required at pickup. Return by the agreed time; extra hours are charged pro rata.'),
  ('Bicycle Rental (Hourly)', 'A bicycle by the hour.', 'A bicycle by the hour.

ID proof required at pickup. Tell us how many hours and when you want it, and we''ll confirm availability.'),
  ('Bike Rental (per day)', 'A motorbike for the day.', 'A motorbike for the day.

ID proof and a valid driving licence required at pickup. Fuel extra.'),
  ('Bingo (Pack)', 'Bingo namkeen, flavour as you specify.', 'Bingo namkeen, flavour as you specify.'),
  ('Birth Certificate', 'Application assistance for a birth certificate — new issue or a correction.', 'Application assistance for a birth certificate — new issue or a correction.

We tell you which office holds the record and what proof is needed, complete the application, and follow it up.'),
  ('Black Currant Ice Cream (Cup)', 'Single cup of black currant ice cream.', 'Single cup of black currant ice cream.'),
  ('Black Forest Cake (1 kg)', 'Chocolate sponge layered with cream and cherries, one kilo.', 'Chocolate sponge layered with cream and cherries, one kilo.

Name piping free. Please order ahead for same-day delivery.'),
  ('Black Forest Cake (500 g)', 'Chocolate sponge layered with cream and cherries, 500 g.', 'Chocolate sponge layered with cream and cherries, 500 g.

Name piping is free — send us the wording. Order a few hours ahead where you can.'),
  ('Body Lotion', 'Body lotion, brand and size as you specify.', 'Body lotion, brand and size as you specify.'),
  ('Boiled Egg', 'Farm egg, boiled and peeled.', 'Farm egg, boiled and peeled. Salt and pepper on request.'),
  ('Bread (400 g)', 'A 400 g loaf — white, brown or sandwich.', 'A 400 g loaf — white, brown or sandwich. Say which.'),
  ('Brownie (1 pc)', 'Dense chocolate brownie, fudgy through the middle.', 'Dense chocolate brownie, fudgy through the middle.'),
  ('Bus Ticket Booking Help', 'Bus tickets booked for you.', 'Bus tickets booked for you.

Share the route, date and roughly what time you want to travel. We check what''s available and confirm with you before booking. Ticket cost is yours; our fee is for the booking.'),
  ('Butter Chicken (Bowl)', 'Boneless chicken in a mild tomato and butter gravy, finished with cream.', 'Boneless chicken in a mild tomato and butter gravy, finished with cream. Order with naan or chapati.'),
  ('Butter Naan (2 pcs)', 'Two tandoor-baked naans brushed with butter while still hot.', 'Two tandoor-baked naans brushed with butter while still hot.'),
  ('Butterscotch Cake (500 g)', 'Butterscotch cream cake with praline crunch, 500 g.', 'Butterscotch cream cake with praline crunch, 500 g. Name piping free.'),
  ('Butterscotch Ice Cream (Cup)', 'Single cup of butterscotch ice cream, with praline through it.', 'Single cup of butterscotch ice cream, with praline through it.'),
  ('Butterscotch Shake (300 ml)', 'Butterscotch milkshake, 300 ml.', 'Butterscotch milkshake, 300 ml.'),
  ('Car Rental (per day)', 'A car for the day, with or without a driver.', 'A car for the day, with or without a driver.

Tell us the date, roughly how far you''re going, and whether you want a driver. Fuel and tolls are extra; the rate is confirmed before booking.'),
  ('Carpenter Visit', 'A local carpenter sent to your address.', 'A local carpenter sent to your address.

Doors and windows, hinges and locks, furniture repair, shelving and small fittings.

Quoted on site once the work is seen, and only started once you agree.'),
  ('Chapati (2 pcs)', 'Two soft wheat chapatis off the tawa.', 'Two soft wheat chapatis off the tawa. Pair with any curry bowl.'),
  ('Chettinad Chicken Curry (Bowl)', 'Chicken in a dark Chettinad masala ground with roasted spices and coconut.', 'Chicken in a dark Chettinad masala ground with roasted spices and coconut. Properly hot.'),
  ('Chicken 65 (Plate)', 'Bite-sized chicken marinated in chilli, ginger and curd, fried crisp and tossed with curry leaf.', 'Bite-sized chicken marinated in chilli, ginger and curd, fried crisp and tossed with curry leaf.'),
  ('Chicken Biryani (Plate)', 'Seeraga samba rice layered with chicken and hand-ground masala, then dum-cooked so the grains stay separate.', 'Seeraga samba rice layered with chicken and hand-ground masala, then dum-cooked so the grains stay separate. Served with onion raita and brinjal gravy.'),
  ('Chicken Fried Rice (Plate)', 'Rice tossed on a high flame with shredded chicken, spring onion and pepper.', 'Rice tossed on a high flame with shredded chicken, spring onion and pepper.'),
  ('Chicken Kothu Parotta (Plate)', 'Parotta shredded on the griddle with chicken and salna, chopped and tossed together until every piece is coated.', 'Parotta shredded on the griddle with chicken and salna, chopped and tossed together until every piece is coated.'),
  ('Chicken Kurma (Bowl)', 'Chicken in a mild coconut and cashew kurma.', 'Chicken in a mild coconut and cashew kurma. The standard pairing for parotta or idiyappam.'),
  ('Chicken Meals (Plate)', 'Full plate meals — rice, sambar, rasam, poriyal, curd and appalam, with a chicken curry.', 'Full plate meals — rice, sambar, rasam, poriyal, curd and appalam, with a chicken curry.'),
  ('Chicken Noodles (Plate)', 'Noodles tossed with shredded chicken, spring onion and soy on a high flame.', 'Noodles tossed with shredded chicken, spring onion and soy on a high flame.'),
  ('Chicken Puff (1 pc)', 'Puff pastry with a spiced chicken filling.', 'Puff pastry with a spiced chicken filling.'),
  ('Chicken Roll (1 pc)', 'Soft bread roll with a spiced chicken filling.', 'Soft bread roll with a spiced chicken filling.'),
  ('Chilli Chicken (Plate)', 'Fried chicken tossed with onion, capsicum and green chilli in a soy-based sauce.', 'Fried chicken tossed with onion, capsicum and green chilli in a soy-based sauce. Semi-dry.'),
  ('Chocolate Ice Cream (Cup)', 'Single cup of chocolate ice cream.', 'Single cup of chocolate ice cream.'),
  ('Chocolate Shake (300 ml)', 'Chocolate milkshake, 300 ml, blended thick.', 'Chocolate milkshake, 300 ml, blended thick.'),
  ('Chocolate Truffle Cake (500 g)', 'Dense chocolate sponge under a truffle ganache, 500 g.', 'Dense chocolate sponge under a truffle ganache, 500 g. Name piping free.'),
  ('Coca-Cola (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('Community Certificate', 'Application assistance for a community certificate.', 'Application assistance for a community certificate.

We complete the form, tell you which supporting documents are required, and track the application.'),
  ('Cook (per meal)', 'A cook arranged for one meal at your home.', 'A cook arranged for one meal at your home.

Tell us how many people, veg or non-veg, and roughly what you want made. Ingredients are either yours or bought at cost and itemised.'),
  ('Cooking Oil (1 L)', 'One litre of cooking oil.', 'One litre of cooking oil. Tell us sunflower, groundnut, gingelly or a brand.'),
  ('Cotton Roll', 'Absorbent cotton roll for dressing and cleaning wounds.', 'Absorbent cotton roll for dressing and cleaning wounds.'),
  ('Cough Syrup', 'Cough syrup, brand as stocked at the pharmacy.', 'Cough syrup, brand as stocked at the pharmacy.

Tell us whether it''s a dry or wet cough and who it''s for, and we''ll ask the pharmacist to match it.'),
  ('Cream Bun (1 pc)', 'Soft bun split and filled with sweet cream.', 'Soft bun split and filled with sweet cream.'),
  ('Curd Rice (Plate)', 'Rice folded through set curd and tempered with mustard, curry leaf and ginger.', 'Rice folded through set curd and tempered with mustard, curry leaf and ginger. Cooling, and it travels well.'),
  ('Custom Request', 'Anything not listed here.', 'Anything not listed here.

Describe what you need in your own words. We''ll tell you honestly whether we can do it, what it will cost, and how long it will take — before anything is committed.'),
  ('DTH Recharge', 'DTH recharge done for you.', 'DTH recharge done for you.

Share the operator, the registered number or customer ID, and the amount. Recharge at face value plus our service fee.'),
  ('Dairy Milk (Bar)', 'Cadbury Dairy Milk bar.', 'Cadbury Dairy Milk bar. Tell us the size.'),
  ('Dal Fry (Bowl)', 'Toor dal cooked soft and tempered with garlic, cumin and dried chilli.', 'Toor dal cooked soft and tempered with garlic, cumin and dried chilli. Order with rice or roti.'),
  ('Death Certificate', 'Application assistance for a death certificate.', 'Application assistance for a death certificate.

We complete the paperwork and follow it through the local office. Tell us the date and place of death and we''ll tell you exactly what''s needed.'),
  ('Deodorant', 'Deodorant spray or roll-on, brand as you specify.', 'Deodorant spray or roll-on, brand as you specify.'),
  ('Detergent Powder (1 kg)', 'One kilo of detergent powder, brand as you specify.', 'One kilo of detergent powder, brand as you specify.'),
  ('Digital Thermometer', 'Digital thermometer with a fast read and a fever alarm.', 'Digital thermometer with a fast read and a fever alarm. Battery included.'),
  ('Document Submission', 'Papers dropped off at a local office exactly as you instruct.', 'Papers dropped off at a local office exactly as you instruct.

Hand over or send the documents, tell us where they go and to whom, and we deliver them and bring back the acknowledgement or receipt.'),
  ('Donut (1 pc)', 'Glazed ring donut.', 'Glazed ring donut. Flavour depends on the day''s batch.'),
  ('Dosa (1 pc)', 'One crisp dosa straight off the tawa — thin and brittle at the edge, soft towards the centre.', 'One crisp dosa straight off the tawa — thin and brittle at the edge, soft towards the centre. Served with coconut chutney and sambar.'),
  ('Dragon Chicken (Plate)', 'Fried chicken in a sweet-hot chilli and cashew sauce.', 'Fried chicken in a sweet-hot chilli and cashew sauce. Sweeter and heavier than Chilli Chicken.'),
  ('Drinking Water Can (20 L)', 'A 20-litre drinking water can delivered to your door.', 'A 20-litre drinking water can delivered to your door.

We collect the empty can when we deliver the next one.'),
  ('Driving Licence Services', 'Learner''s licence, permanent licence and renewals.', 'Learner''s licence, permanent licence and renewals.

We handle the application and slot booking and tell you what to carry. Tests and biometrics you attend yourself; we''ll tell you what to expect.'),
  ('EB Bill Payment', 'Electricity bill paid on your behalf.', 'Electricity bill paid on your behalf.

Share the consumer number. We pay and send you the receipt. Bill amount at cost, plus our service fee.'),
  ('Egg Fried Rice (Plate)', 'Rice tossed on a high flame with scrambled egg, spring onion and pepper.', 'Rice tossed on a high flame with scrambled egg, spring onion and pepper.'),
  ('Egg Kothu Parotta (Plate)', 'Parotta shredded on the griddle with egg scrambled straight into it, tossed with onion and salna.', 'Parotta shredded on the griddle with egg scrambled straight into it, tossed with onion and salna.'),
  ('Egg Masala (Plate)', 'Boiled eggs simmered in a thick onion-tomato masala.', 'Boiled eggs simmered in a thick onion-tomato masala.'),
  ('Egg Noodles (Plate)', 'Noodles tossed with egg, spring onion and pepper on a high flame.', 'Noodles tossed with egg, spring onion and pepper on a high flame.'),
  ('Egg Puff (1 pc)', 'Puff pastry around a boiled egg and spiced onion masala.', 'Puff pastry around a boiled egg and spiced onion masala.'),
  ('Eggs (6 pcs)', 'Half a dozen eggs, checked for cracks before they leave the shop.', 'Half a dozen eggs, checked for cracks before they leave the shop.'),
  ('Electrician Visit', 'A local electrician sent to your address.', 'A local electrician sent to your address.

Wiring faults, switches and boards, fan and light fitting, inverter and meter issues.

Tell us the problem when you book. Cost depends on the job and any parts needed — the electrician quotes on site, and you approve before work starts.'),
  ('Event Catering', 'Cooks and catering for a function, at any scale.', 'Cooks and catering for a function, at any scale.

From a home function for thirty to a wedding for several hundred. Tell us the date, the headcount, veg or non-veg, and the menu you have in mind — we come back with caterers, sample menus and per-plate rates.'),
  ('Event Chairs (10 pcs)', 'Ten chairs on rent, per day.', 'Ten chairs on rent, per day.

Delivery and collection included within town. Order more than one set if you need a larger count.'),
  ('Event Cleaning', 'Venue cleaning before and after a function.', 'Venue cleaning before and after a function.

Clearing, sweeping, waste removal and washing up. Priced by venue size and the number of hands needed.'),
  ('Event Decoration', 'Stage, entrance and hall decoration.', 'Stage, entrance and hall decoration.

Flowers, drapes, lighting, backdrops and name boards. Share the occasion and a photo of anything you like the look of, and we''ll match it to a local decorator and a price.'),
  ('Event Photography', 'Photo and video coverage for a function.', 'Photo and video coverage for a function.

Tell us the date, the hours you need covered, and whether you want prints, an album or just files. We match you to a local photographer and share their rate before booking.'),
  ('Face Cream', 'Face cream or moisturiser, brand as you specify.', 'Face cream or moisturiser, brand as you specify.'),
  ('Face Wash', 'Face wash, brand as you specify.', 'Face wash, brand as you specify.'),
  ('Fanta (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('Filter Coffee (150 ml)', 'Proper South Indian filter coffee — fresh decoction and hot milk, frothed between tumbler and dabara.', 'Proper South Indian filter coffee — fresh decoction and hot milk, frothed between tumbler and dabara.'),
  ('Fish 65 (Plate)', 'Boneless fish cubes marinated and fried crisp, tossed with curry leaf and green chilli.', 'Boneless fish cubes marinated and fried crisp, tossed with curry leaf and green chilli.'),
  ('Fish Meals (Plate)', 'Full plate meals — rice, sambar, rasam, poriyal, curd and appalam, with fish curry and a fry piece.', 'Full plate meals — rice, sambar, rasam, poriyal, curd and appalam, with fish curry and a fry piece.'),
  ('Five Star (Bar)', 'Five Star bar.', 'Five Star bar.'),
  ('Flowers & Garlands', 'Loose flowers and garlands, including bulk for functions.', 'Loose flowers and garlands, including bulk for functions.

Daily pooja quantities, or full function orders arranged a day ahead. Tell us the flower, the weight or garland count, and the date.'),
  ('French Fries (Plate)', 'Potato fries, fried to order and salted.', 'Potato fries, fried to order and salted. Ketchup on the side.'),
  ('Fresh Vegetables Basket', 'A mixed basket of the day''s vegetables.', 'A mixed basket of the day''s vegetables.

Tell us roughly what you cook and for how many people, and we''ll put together what''s fresh in the market that morning.'),
  ('Function Hall Booking', 'Halls for weddings, receptions, engagements, birthdays and funerals.', 'Halls for weddings, receptions, engagements, birthdays and funerals.

Tell us the date, the guest count and the budget. We check what''s actually free locally and come back with options, capacity and real prices.

The hall is paid directly to its owner. Our fee is for finding and coordinating it.'),
  ('Ghee Idli (2 pcs)', 'Our regular idlis finished with a spoon of hot ghee that soaks straight in.', 'Our regular idlis finished with a spoon of hot ghee that soaks straight in. Served with chutney and sambar.'),
  ('Ghee Roast Dosa (1 pc)', 'Roasted longer than a plain dosa and basted with ghee until it''s evenly golden and crackling right through.', 'Roasted longer than a plain dosa and basted with ghee until it''s evenly golden and crackling right through. Chutney and sambar included.'),
  ('Gift Delivery', 'A gift bought and delivered locally on your behalf.', 'A gift bought and delivered locally on your behalf.

Tell us the occasion, the budget and the address. We''ll send options first if you want to choose, or pick something suitable if you''d rather not.'),
  ('Gobi Fried Rice (Plate)', 'Rice tossed on a high flame with fried cauliflower, spring onion and soy.', 'Rice tossed on a high flame with fried cauliflower, spring onion and soy.'),
  ('Gobi Manchurian (Plate)', 'Cauliflower florets battered, fried, then tossed in a tangy Manchurian sauce.', 'Cauliflower florets battered, fried, then tossed in a tangy Manchurian sauce. Semi-dry.'),
  ('Gobi Noodles (Plate)', 'Noodles tossed with fried cauliflower and spring onion on a high flame.', 'Noodles tossed with fried cauliflower and spring onion on a high flame.'),
  ('Good Day (Pack)', 'Good Day biscuits — cashew or butter.', 'Good Day biscuits — cashew or butter.'),
  ('Government Form Filling', 'Form filling for government portals, done correctly the first time.', 'Form filling for government portals, done correctly the first time.

Bring or send the details and the documents; we complete the form, show it to you before submitting, and give you the acknowledgement.'),
  ('Government Office Assistance', 'Guidance and accompaniment for a local government office visit.', 'Guidance and accompaniment for a local government office visit.

We tell you which office, which counter, what to carry and what it usually costs — and go with you if that helps.'),
  ('Grape Juice (300 ml)', 'Fresh grape juice, 300 ml.', 'Fresh grape juice, 300 ml.'),
  ('Grapes (1 kg)', 'Grapes by the kilo, seedless where available.', 'Grapes by the kilo, seedless where available.'),
  ('Guest & Family Stay Booking', 'Rooms arranged for visiting family and guests.', 'Rooms arranged for visiting family and guests.

Tell us how many people, which nights, and roughly what budget. We check what''s actually available locally and come back with options and real prices.

We don''t take payment for the room — you pay the lodge directly. Our fee is for the arranging.'),
  ('Guest Pickup', 'Someone arriving in town and no one free to fetch them.', 'Someone arriving in town and no one free to fetch them.

Share the arrival point and time — bus stand, railway station or a nearby town — and we arrange the pickup and see them to your door.

Vehicle cost is confirmed with you before we book anything.'),
  ('Hair Oil', 'Hair oil — coconut, almond or a branded blend.', 'Hair oil — coconut, almond or a branded blend. Tell us which.'),
  ('Heating Patch', 'Adhesive heat patch for period cramps, back pain and muscle ache.', 'Adhesive heat patch for period cramps, back pain and muscle ache. Lasts several hours per patch.'),
  ('Home-style Veg Meals', 'Cooked the way it is at home rather than in a hotel — lighter on oil and chilli.', 'Cooked the way it is at home rather than in a hotel — lighter on oil and chilli. Rice, sambar, rasam, poriyal and curd.'),
  ('House Cleaning (2 hr)', 'Two hours of household cleaning.', 'Two hours of household cleaning.

Sweeping, mopping, bathroom and kitchen cleaning, or a deeper clean of one area — tell us the priority when you book.

Materials can be yours or supplied at cost.'),
  ('House Painting', 'Interior or exterior painting.', 'Interior or exterior painting.

We arrange a painter to see the property and quote — area, surface condition and paint choice all change the price, so nothing is quoted blind.'),
  ('Ice Cream Family Pack (700 ml)', 'A 700 ml family pack.', 'A 700 ml family pack. Tell us the flavour; we''ll confirm if the shop is out of it.'),
  ('Idli (2 pcs)', 'Two soft, steam-cooked rice-and-urad idlis — light, plain, and made to soak up whatever you pair them with.', 'Two soft, steam-cooked rice-and-urad idlis — light, plain, and made to soak up whatever you pair them with. Served with coconut chutney and hot sambar.'),
  ('Idli Sambar (4 pcs)', 'Four idlis served sitting in hot sambar rather than beside it, the way it''s eaten at home.', 'Four idlis served sitting in hot sambar rather than beside it, the way it''s eaten at home. Chutney on the side.'),
  ('Income Certificate', 'Application assistance for an income certificate.', 'Application assistance for an income certificate.

Usually needed for scholarships, admissions and scheme applications. We tell you what to gather and complete the application.'),
  ('Invitation Printing', 'Wedding and function invitation cards.', 'Wedding and function invitation cards.

We show you designs and per-card rates, get the wording proofed with you, and hand over the printed cards. Tamil and English both fine.'),
  ('Kadai Chicken (Bowl)', 'Chicken tossed in a thick kadai masala with capsicum, onion and crushed coriander seed.', 'Chicken tossed in a thick kadai masala with capsicum, onion and crushed coriander seed.'),
  ('Kal Dosa (2 pcs)', 'Two thick, spongy dosas — soft rather than crisp, made to hold gravy.', 'Two thick, spongy dosas — soft rather than crisp, made to hold gravy. Best ordered with a kurma or curry bowl.'),
  ('KitKat (Bar)', 'KitKat bar.', 'KitKat bar.'),
  ('KitKat Shake (300 ml)', 'KitKat blended into cold milk, 300 ml.', 'KitKat blended into cold milk, 300 ml.'),
  ('Kurkure (Pack)', 'Kurkure, flavour as you specify.', 'Kurkure, flavour as you specify.'),
  ('Kuska (Plate)', 'Biryani rice cooked in the same masala and stock, just without the meat.', 'Biryani rice cooked in the same masala and stock, just without the meat. Good on its own or alongside a curry.'),
  ('Lays (Pack)', 'Potato chips.', 'Potato chips. Tell us the flavour you want.'),
  ('Lemon Juice (300 ml)', 'Fresh lime juice, 300 ml.', 'Fresh lime juice, 300 ml. Sweet, salt or both — tell us which.'),
  ('Lemon Rice (Plate)', 'Rice tossed with lemon, turmeric, mustard seed, curry leaf and peanut.', 'Rice tossed with lemon, turmeric, mustard seed, curry leaf and peanut. Tart and light.'),
  ('Limca (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('Local Cab (1-way)', 'One-way cab within about 15 km.', 'One-way cab within about 15 km.

Tell us the pickup point, the drop and the time. Fare is confirmed with you before the cab is sent.'),
  ('Local Guide', 'Someone who knows the town, for people who don''t.', 'Someone who knows the town, for people who don''t.

For visiting family, new employees or anyone recently moved: where things are, which shop to use, how a local process actually works.'),
  ('Local Pickup & Drop', 'Documents or a small parcel moved from one place to another within town.', 'Documents or a small parcel moved from one place to another within town.

Give us the two addresses and a contact at each end. Same-day where the timing allows.'),
  ('Maaza (250 ml)', 'Chilled 250 ml mango drink.', 'Chilled 250 ml mango drink.'),
  ('Mango Ice Cream Cone', 'Mango ice cream in a wafer cone.', 'Mango ice cream in a wafer cone.'),
  ('Mango Juice (300 ml)', 'Fresh mango juice, 300 ml.', 'Fresh mango juice, 300 ml. Tell us if you want it without sugar.'),
  ('Mango Shake (300 ml)', 'Mango blended with cold milk, 300 ml.', 'Mango blended with cold milk, 300 ml.'),
  ('Masala Dosa (1 pc)', 'Crisp dosa folded over spiced potato masala with onion and curry leaf.', 'Crisp dosa folded over spiced potato masala with onion and curry leaf. Served with chutney and sambar.'),
  ('Medicine Pickup', 'Pickup from a local pharmacy when you already know what you need.', 'Pickup from a local pharmacy when you already know what you need.

Send a photo of the prescription or strip. We collect it and deliver.

Prescription medicines are only collected where the pharmacy is willing to dispense them. Price is whatever the pharmacy charges, plus our fee.'),
  ('Medu Vada (2 pcs)', 'Two urad dal vadas fried to order, crisp outside and light within.', 'Two urad dal vadas fried to order, crisp outside and light within. Served with chutney and sambar.'),
  ('Milk (500 ml)', 'Half a litre of packet milk.', 'Half a litre of packet milk. Tell us the brand you use; we''ll confirm before delivery if it isn''t available.'),
  ('Mini Idli (14 pcs)', 'Fourteen button-sized idlis made to be dunked rather than eaten dry.', 'Fourteen button-sized idlis made to be dunked rather than eaten dry. A full breakfast for one or a shared plate for two, with chutney and sambar.'),
  ('Mini Meals (Plate)', 'A smaller meals plate: rice, sambar, rasam, one poriyal, curd and appalam.', 'A smaller meals plate: rice, sambar, rasam, one poriyal, curd and appalam. Enough for a light lunch.'),
  ('Mixed Fruit Juice (300 ml)', 'A blend of the day''s fruit, 300 ml.', 'A blend of the day''s fruit, 300 ml.'),
  ('Mobile Recharge', 'Prepaid recharge done for you.', 'Prepaid recharge done for you.

Share the number, the operator and the plan or amount. Recharge is at face value; our service fee is shown in the cart before you order.'),
  ('Munch (Bar)', 'Munch bar.', 'Munch bar.'),
  ('Mushroom Fried Rice (Plate)', 'Rice tossed on a high flame with sliced mushroom, spring onion and pepper.', 'Rice tossed on a high flame with sliced mushroom, spring onion and pepper.'),
  ('Mushroom Manchurian (Plate)', 'Mushrooms battered, fried and tossed in a tangy Manchurian sauce.', 'Mushrooms battered, fried and tossed in a tangy Manchurian sauce. Semi-dry.'),
  ('Mushroom Noodles (Plate)', 'Noodles tossed with sliced mushroom, spring onion and pepper on a high flame.', 'Noodles tossed with sliced mushroom, spring onion and pepper on a high flame.'),
  ('Mushroom Puff (1 pc)', 'Puff pastry with a peppery mushroom filling.', 'Puff pastry with a peppery mushroom filling.'),
  ('Mutton Biryani (Plate)', 'Seeraga samba rice slow-cooked with bone-in mutton until the meat gives way.', 'Seeraga samba rice slow-cooked with bone-in mutton until the meat gives way. Served with onion raita and gravy.'),
  ('Nativity Certificate', 'Application assistance for a nativity certificate.', 'Application assistance for a nativity certificate.

We complete the application and tell you what proof of residence the office will want.'),
  ('ORS (Pack)', 'Oral rehydration salts.', 'Oral rehydration salts. Mix one sachet into the stated volume of clean water.

Keep some at home through summer and through any stomach illness.'),
  ('Omelette (2 Eggs)', 'Two-egg omelette cooked soft, with onion, green chilli and coriander.', 'Two-egg omelette cooked soft, with onion, green chilli and coriander.'),
  ('Onion Dosa (1 pc)', 'Dosa with finely chopped onion pressed into the batter on the tawa, so it sweetens and browns as it cooks.', 'Dosa with finely chopped onion pressed into the batter on the tawa, so it sweetens and browns as it cooks. Chutney and sambar included.'),
  ('Online Application Help', 'General help with any online application — schemes, admissions, registrations, portals.', 'General help with any online application — schemes, admissions, registrations, portals.

Tell us what you''re applying for. We''ll tell you whether it''s something we can do and what it needs.'),
  ('Orange (1 kg)', 'Oranges by the kilo, picked for juice or for eating — tell us which.', 'Oranges by the kilo, picked for juice or for eating — tell us which.'),
  ('Orange Juice (300 ml)', 'Fresh orange juice, 300 ml, pressed to order.', 'Fresh orange juice, 300 ml, pressed to order.'),
  ('Oreo (Pack)', 'Oreo biscuits.', 'Oreo biscuits.'),
  ('Oreo Shake (300 ml)', 'Oreo blended into cold milk, 300 ml, with the biscuit still in pieces through it.', 'Oreo blended into cold milk, 300 ml, with the biscuit still in pieces through it.'),
  ('PAN Card Services', 'New PAN applications and corrections to an existing card.', 'New PAN applications and corrections to an existing card.

We fill the form, check your documents against what''s actually required, and track it to delivery. Government fee at cost, our service fee shown before you order.'),
  ('Pain Relief Spray', 'Spray for muscle and joint pain.', 'Spray for muscle and joint pain. External use only.'),
  ('Paneer Butter Masala (Bowl)', 'Paneer cubes in a mild tomato-and-butter gravy finished with cream.', 'Paneer cubes in a mild tomato-and-butter gravy finished with cream. Order with naan or chapati.'),
  ('Paneer Manchurian (Plate)', 'Paneer cubes fried and tossed in a tangy Manchurian sauce with onion and capsicum.', 'Paneer cubes fried and tossed in a tangy Manchurian sauce with onion and capsicum.'),
  ('Panty Liners (Pack)', 'Panty liners, brand as stocked.', 'Panty liners, brand as stocked. Delivered in plain packaging.'),
  ('Papaya (1 pc)', 'One papaya.', 'One papaya. Say whether you want it ripe now or in a couple of days.'),
  ('Paracetamol (Strip)', 'Standard fever and pain tablets, sold by the strip.', 'Standard fever and pain tablets, sold by the strip.

Brand depends on what the pharmacy has in stock; we''ll tell you what we''re bringing. Not a substitute for seeing a doctor if the fever persists.'),
  ('Parcel Pickup / Courier Drop', 'Courier work handled on your behalf.', 'Courier work handled on your behalf.

We collect from your door and book it at the courier office, or collect a delivered parcel and bring it to you. Courier charges are at cost, shown on the receipt.'),
  ('Parent Assistance', 'For anyone working away from Karimangalam while their parents are here.', 'For anyone working away from Karimangalam while their parents are here.

Tell us what''s needed — groceries dropped off, a hospital or bank visit, a bill paid, someone to check in — and we handle it locally and report back to you.

We call you before and after, so you always know what happened. Pay per task; nothing is charged until you agree the amount.'),
  ('Parotta (2 pcs)', 'Two flaky Madurai-style parottas, slapped and coiled by hand so they pull apart in layers.', 'Two flaky Madurai-style parottas, slapped and coiled by hand so they pull apart in layers. Best with salna or a curry.'),
  ('Passport Appointment Help', 'Passport application filling and appointment booking.', 'Passport application filling and appointment booking.

We complete the online form, book the Seva Kendra slot, and give you a checklist of originals to carry. Government fee paid online at cost.'),
  ('Passport Photo', 'Passport-size photographs, printed to specification.', 'Passport-size photographs, printed to specification.

Standard sets for applications and forms. Tell us how many copies and what they''re for, since different applications want different sizes.'),
  ('Pension Assistance', 'Help with pension applications, renewals and life certificates.', 'Help with pension applications, renewals and life certificates.

Old age, widow and disability pensions. We complete the paperwork and tell you which office to visit and when.'),
  ('Pepper Chicken (Plate)', 'Chicken tossed dry with plenty of crushed black pepper and curry leaf.', 'Chicken tossed dry with plenty of crushed black pepper and curry leaf. Heat from pepper, not chilli.'),
  ('Pepsi (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('Perk (Bar)', 'Perk bar.', 'Perk bar.'),
  ('Pest Control', 'Treatment for cockroaches, ants, mosquitoes, termites or rodents.', 'Treatment for cockroaches, ants, mosquitoes, termites or rodents.

Tell us the problem and the size of the property. We arrange a local operator, who confirms the treatment, the price and any precautions before starting.'),
  ('Pineapple (1 pc)', 'One pineapple.', 'One pineapple. We''ll have it cleaned and cut on request.'),
  ('Pineapple Cake (500 g)', 'Pineapple and fresh cream sponge, 500 g.', 'Pineapple and fresh cream sponge, 500 g. Name piping free.'),
  ('Pineapple Juice (300 ml)', 'Fresh pineapple juice, 300 ml.', 'Fresh pineapple juice, 300 ml.'),
  ('Plumber Visit', 'A local plumber sent to your address.', 'A local plumber sent to your address.

Leaks, taps and mixers, blockages, motor and tank connections, bathroom fittings.

Cost depends on the job and any parts needed. The plumber quotes on site and you approve before work starts.'),
  ('Pomegranate (1 kg)', 'Pomegranates by the kilo, chosen heavy for their size.', 'Pomegranates by the kilo, chosen heavy for their size.'),
  ('Pomegranate Juice (300 ml)', 'Fresh pomegranate juice, 300 ml, pressed to order.', 'Fresh pomegranate juice, 300 ml, pressed to order.'),
  ('Pongal (Plate)', 'Rice and moong dal cooked down together until soft, heavy with ghee, crushed pepper, cumin and cashew.', 'Rice and moong dal cooked down together until soft, heavy with ghee, crushed pepper, cumin and cashew. Served with sambar and chutney.'),
  ('Poori (2 pcs)', 'Two pooris puffed fresh in hot oil, served with potato masala.', 'Two pooris puffed fresh in hot oil, served with potato masala.'),
  ('Pregnancy Test Kit', 'Home pregnancy test kit.', 'Home pregnancy test kit. Delivered in plain packaging, with no mention of contents to the person at the door.'),
  ('Priest Booking', 'A purohit arranged for a ceremony.', 'A purohit arranged for a ceremony.

Housewarming, wedding, naming, puberty function, homam or a death ceremony. Tell us the ritual and the date; we confirm availability and the samagri you''ll need to arrange.'),
  ('Printout / Xerox', 'Printing and photocopying.', 'Printing and photocopying.

Send the file on WhatsApp or hand over the original. Black-and-white or colour, single or double sided — tell us which and how many.'),
  ('Queue Standing', 'Someone to hold your place in a line.', 'Someone to hold your place in a line.

Common for government offices, bank counters, EB offices and certificate windows. We wait; you arrive when it''s close to your turn.

Charged by time. Tell us the office and the day, and we''ll confirm what''s realistic.'),
  ('Rava Dosa (1 pc)', 'Lacy semolina dosa, crisp the whole way through with its characteristic net of holes.', 'Lacy semolina dosa, crisp the whole way through with its characteristic net of holes. Served with chutney and sambar.'),
  ('Red Bull (250 ml)', 'Chilled 250 ml can.', 'Chilled 250 ml can.'),
  ('Red Velvet Cake (500 g)', 'Red velvet sponge with cream cheese frosting, 500 g.', 'Red velvet sponge with cream cheese frosting, 500 g. Name piping free.'),
  ('Salon Appointment', 'An appointment booked at a local salon — you go to the shop, at a time that suits you.', 'An appointment booked at a local salon — you go to the shop, at a time that suits you.

Haircut, shave, facial, threading or colouring. Tell us what you want done and roughly when; we confirm the slot and the shop''s rate before booking.

This is a booking service. The salon charges you directly.'),
  ('Sanitary Pads (Pack)', 'Sanitary pads.', 'Sanitary pads. Tell us the size and flow you use, or the brand, and we''ll match it.

Delivered in plain packaging.'),
  ('Shampoo (Sachet/Bottle)', 'Shampoo, in sachets or a bottle.', 'Shampoo, in sachets or a bottle. Say which and which brand.'),
  ('Shopping Assistance', 'Send us a list and we shop it locally on your behalf.', 'Send us a list and we shop it locally on your behalf.

Works for anything the app doesn''t stock — a specific brand, a shop you trust, a size or colour you want checked in person. We''ll photograph options and confirm before buying if it''s not obvious.

You pay the actual bill plus our service fee. We share the receipt.'),
  ('Slice (250 ml)', 'Chilled 250 ml mango drink.', 'Chilled 250 ml mango drink.'),
  ('Soap (Bar)', 'Bath soap.', 'Bath soap. Tell us the brand you use and we''ll bring it if the shop has it.'),
  ('Spiral Binding', 'Spiral binding for reports, project books and records.', 'Spiral binding for reports, project books and records.

Hand over the printed sheets, or send the file and we''ll print and bind together. Tell us the cover you want.'),
  ('Sprite (250 ml)', 'Chilled 250 ml bottle.', 'Chilled 250 ml bottle.'),
  ('Strawberry Shake (300 ml)', 'Strawberry milkshake, 300 ml.', 'Strawberry milkshake, 300 ml.'),
  ('Sugar (1 kg)', 'One kilo of sugar.', 'One kilo of sugar.'),
  ('Sweet Lime (1 kg)', 'Mosambi by the kilo.', 'Mosambi by the kilo. Good for juicing.'),
  ('Sweet Lime Juice (300 ml)', 'Fresh mosambi juice, 300 ml.', 'Fresh mosambi juice, 300 ml. Say if you want salt in it.'),
  ('Tailor Pickup & Drop', 'Alterations without the two trips.', 'Alterations without the two trips.

We collect the garment, take it to your tailor or one we know, explain the alteration, and bring it back when it''s ready. Tailor''s charge is paid directly to them.'),
  ('Talcum Powder', 'Talcum powder, brand as you specify.', 'Talcum powder, brand as you specify.'),
  ('Tamarind Rice (Plate)', 'Puliyodarai — rice mixed through a dark tamarind and sesame paste, with peanuts through it.', 'Puliyodarai — rice mixed through a dark tamarind and sesame paste, with peanuts through it.'),
  ('Tampons (Pack)', 'Tampons, brand and absorbency as stocked.', 'Tampons, brand and absorbency as stocked. Delivered in plain packaging.'),
  ('Tandoori Roti (2 pcs)', 'Two whole-wheat rotis baked in the tandoor — firmer than naan, lighter than parotta.', 'Two whole-wheat rotis baked in the tandoor — firmer than naan, lighter than parotta.'),
  ('Tea (150 ml)', 'Strong tea boiled with milk.', 'Strong tea boiled with milk. The standard shop-style glass.'),
  ('Tent, Chairs & Seating', 'Shamiana, chairs, tables and stage setup on rent.', 'Shamiana, chairs, tables and stage setup on rent.

Give us the date, venue and rough numbers. Delivery, setup and takedown are included in the quote.'),
  ('Threading & Waxing Appointment', 'A threading or waxing appointment booked at a local ladies'' salon.', 'A threading or waxing appointment booked at a local ladies'' salon.

Tell us what you want done and when. We confirm the slot and the shop''s rate; you pay the salon directly.'),
  ('Tomato Rice (Plate)', 'Rice cooked down with tomato, onion and garam masala until it takes the colour right through.', 'Rice cooked down with tomato, onion and garam masala until it takes the colour right through.'),
  ('Toothbrush', 'Toothbrush — soft or medium, as you prefer.', 'Toothbrush — soft or medium, as you prefer.'),
  ('Toothpaste', 'Toothpaste, brand and tube size as you specify.', 'Toothpaste, brand and tube size as you specify.'),
  ('Translation Assistance', 'Tamil and English help for local tasks.', 'Tamil and English help for local tasks.

Useful for forms, office conversations, rental or work agreements, and phone calls where a language gap is the actual problem. In person or over a call.'),
  ('Two-Wheeler Rental (Daily)', 'A two-wheeler for the full day.', 'A two-wheeler for the full day.

ID proof and a valid driving licence required at pickup. Fuel extra. Return with the vehicle in the condition you took it.'),
  ('Two-Wheeler Rental (Hourly)', 'A two-wheeler by the hour.', 'A two-wheeler by the hour.

ID proof and a valid driving licence are both required at pickup — no exceptions. Fuel is extra and yours to fill.'),
  ('Vada (1 pc)', 'One medu vada fried to order — crisp at the edge, airy inside.', 'One medu vada fried to order — crisp at the edge, airy inside. Chutney and sambar on the side.'),
  ('Vanilla Ice Cream (Cup)', 'Single cup of vanilla ice cream.', 'Single cup of vanilla ice cream. Delivered cold — order it with the rest of your food, not ahead of it.'),
  ('Vanilla Shake (300 ml)', 'Vanilla milkshake, 300 ml.', 'Vanilla milkshake, 300 ml.'),
  ('Veg Biryani (Plate)', 'Seeraga samba rice cooked with carrot, beans and potato in whole spices.', 'Seeraga samba rice cooked with carrot, beans and potato in whole spices. Served with onion raita.'),
  ('Veg Fried Rice (Plate)', 'Rice tossed on a high flame with carrot, beans, cabbage and spring onion.', 'Rice tossed on a high flame with carrot, beans, cabbage and spring onion.'),
  ('Veg Kothu Parotta (Plate)', 'Parotta shredded on the griddle and tossed with onion, capsicum and salna until it''s one steaming, savoury plate.', 'Parotta shredded on the griddle and tossed with onion, capsicum and salna until it''s one steaming, savoury plate.'),
  ('Veg Kurma (Bowl)', 'Mixed vegetables in a mild coconut and cashew kurma.', 'Mixed vegetables in a mild coconut and cashew kurma. Made for parotta, idiyappam or chapati.'),
  ('Veg Meals (Plate)', 'Full plate meals — rice, sambar, rasam, two poriyals, curd and appalam.', 'Full plate meals — rice, sambar, rasam, two poriyals, curd and appalam. Unlimited rice on dine-in only.'),
  ('Veg Noodles (Plate)', 'Noodles tossed with carrot, beans, cabbage and spring onion on a high flame.', 'Noodles tossed with carrot, beans, cabbage and spring onion on a high flame.'),
  ('Veg Puff (1 pc)', 'Flaky puff pastry with a spiced vegetable filling.', 'Flaky puff pastry with a spiced vegetable filling. Best eaten warm.'),
  ('Veg Roll (1 pc)', 'Soft bread roll with a spiced vegetable filling.', 'Soft bread roll with a spiced vegetable filling.'),
  ('Voter ID Services', 'New voter registration, corrections, and address transfer.', 'New voter registration, corrections, and address transfer.

We complete the online application, tell you exactly what proof is needed, and follow up until the card is issued.'),
  ('Water Bill Payment', 'Water bill paid on your behalf.', 'Water bill paid on your behalf.

Share the connection number. We pay and send you the receipt.'),
  ('Water Tank Cleaning', 'Overhead or sump tank cleaned and disinfected.', 'Overhead or sump tank cleaned and disinfected.

Draining, scrubbing, sludge removal and disinfecting. Tell us tank size and location; the quote follows from that.'),
  ('Watermelon (1 pc)', 'One whole watermelon.', 'One whole watermelon. Tell us roughly what size suits you.'),
  ('Watermelon Juice (300 ml)', 'Fresh watermelon juice, 300 ml.', 'Fresh watermelon juice, 300 ml. Best on a hot afternoon.'),
  ('White Forest Cake (500 g)', 'White chocolate and cream sponge, 500 g.', 'White chocolate and cream sponge, 500 g. Name piping free.')
)
UPDATE public.products p
SET description = copy.card_line,
    description_long = copy.body
FROM copy
WHERE p.name = copy.product_name;

COMMIT;

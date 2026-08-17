-- Phase 4 catalogue recuration.
--
-- The catalogue was seeded for a demo. This reshapes it around how a Tamil
-- Nadu town of a few thousand people actually shops, based on the owner's
-- read of his own customers:
--
--   * Events are a real, recurring local need with no listing at all today --
--     weddings, Valaikappu, Manjal Neerattu Vizha, Gruhapravesam, birthdays.
--     Every one of them involves a hall, catering, seating, decoration and
--     flowers, and every one is currently arranged by phoning around.
--   * Electrician/plumber/AC sat inside "Local Assistance" alongside errands,
--     which are a different kind of job with different expectations.
--   * "Hotel Booking Assistance" carries a connotation nobody wants attached
--     to a family service, and "Lodge Booking" was worse.
--   * Flower Delivery had no obvious buyer as a single stem; at event scale
--     it does.
--
-- Everything new is enquiry-only (is_service, price on request): MyTown
-- brokers these rather than performing them, and a fixed price would imply
-- otherwise. Prices are agreed on call before anything is committed.

-- ---------------------------------------------------------------------------
-- 1. Rename away the double meaning
-- ---------------------------------------------------------------------------
update public.products
set name = 'Guest & Family Stay Booking',
    description = 'Rooms arranged for visiting family and guests.',
    description_long = 'We find and book a clean, respectable room nearby for family or guests visiting you — for a function, a hospital stay, or a few days'' visit.

We check the room, confirm the tariff and hold the booking in your name. You''re told the exact price before anything is confirmed.

Tell us the dates, how many people, and roughly the budget. If nothing suitable is free we''ll say so rather than putting your guests somewhere we wouldn''t put our own.',
    updated_at = now()
where name = 'Hotel Booking Assistance';

-- ---------------------------------------------------------------------------
-- 2. Home Services -- trades, split out from errands
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, parent_id, icon_key, sort_order)
values ('Home Services', 'home-services', null, 'wrench', 10)
on conflict (slug) do nothing;

-- Move the trades across from Local Assistance.
update public.products
set category_id = (select id from public.categories where slug = 'home-services'),
    tags = array['home-service'],
    updated_at = now()
where name in (
  'Electrician Visit',
  'Plumber Visit',
  'AC Service',
  'House Cleaning (2 hr)'
);

insert into public.products
  (category_id, name, description, description_long, is_service, show_price, price, is_available, tags, sort_order)
select
  (select id from public.categories where slug = 'home-services'),
  v.name, v.short, v.long, true, false, null, true, array['home-service'], v.ord
from (values
  ('Carpenter Visit',
   'Furniture repair, fittings, door and window work.',
   'A local carpenter for repairs and fittings — a door that won''t close, a broken cot, shelves to put up, window work.

Tell us what needs doing and send a photo if you can; that usually tells the carpenter whether it''s a quick job or a half-day, so the estimate you get is realistic.

Materials are bought at actual cost with your approval. Labour is confirmed before work starts.', 5),
  ('Appliance Repair',
   'Fan, mixer, washing machine, fridge, TV.',
   'Repair for household appliances — ceiling fans, mixers, washing machines, fridges, televisions.

Tell us the appliance, the make if you know it, and what''s wrong. We''ll arrange someone who works on that type rather than a general hand.

If it turns out to be beyond economical repair we''ll tell you that plainly instead of charging for a visit that fixes nothing.', 6),
  ('Pest Control',
   'Cockroach, termite and mosquito treatment.',
   'Treatment for cockroaches, termites, mosquitoes and rodents, arranged with a local operator.

Tell us the problem, the rough size of the house, and whether there are young children or pets — that changes what can safely be used.

You''ll be told what''s being applied, how long to stay out afterwards, and the price, all before the visit.', 7),
  ('House Painting',
   'Interior and exterior painting.',
   'Painting for a room, a full house, or an exterior — including before a function or after a repair.

We arrange the painter, and paint is bought at actual cost with your approval so you''re not paying a marked-up rate.

Tell us the rooms or the area and we''ll arrange a look before quoting. Nothing starts until the estimate is agreed.', 8),
  ('Water Tank Cleaning',
   'Overhead and sump tank cleaning.',
   'Cleaning for overhead tanks and sumps — worth doing before the monsoon and after any supply disruption.

Includes draining, scrubbing and refilling. Tell us the tank size and where it is; access matters for the quote.

Price is confirmed before the visit.', 9)
) as v(name, short, long, ord)
where not exists (select 1 from public.products p where p.name = v.name);

-- ---------------------------------------------------------------------------
-- 3. Events & Occasions -- the genuinely new category
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, parent_id, icon_key, sort_order)
values ('Events & Occasions', 'events', null, 'party-popper', 11)
on conflict (slug) do nothing;

-- Flower delivery belongs here: at event scale it has an obvious buyer.
update public.products
set category_id = (select id from public.categories where slug = 'events'),
    name = 'Flowers & Garlands',
    description = 'Loose flowers and garlands, including bulk for functions.',
    description_long = 'Flowers and garlands from local sellers — a daily string for the pooja room, or bulk orders for a function.

For events, tell us the date and roughly how much you need and we''ll arrange it with a seller who can actually supply that quantity on the morning, rather than promising and falling short.

Price varies with the season and the flower; we confirm before buying.',
    tags = array['event'],
    updated_at = now()
where name = 'Flower Delivery';

insert into public.products
  (category_id, name, description, description_long, is_service, show_price, price, is_available, tags, sort_order)
select
  (select id from public.categories where slug = 'events'),
  v.name, v.short, v.long, true, false, null, true, array['event'], v.ord
from (values
  ('Function Hall Booking',
   'Halls for weddings, receptions and functions.',
   'We check which halls are free on your date, what they charge, and what''s included — chairs, kitchen, generator, parking — then hold the one you choose.

Halls quote differently depending on who asks and what''s bundled, so we get it in plain terms and give you the comparison rather than a single number.

Tell us the date, expected guests and rough budget. Booking is confirmed only after you agree the amount.', 1),
  ('Event Catering',
   'Cooks and catering for functions, any scale.',
   'Catering for functions — from a small home gathering to a full wedding meal.

Tell us the date, the headcount and the menu you have in mind (or ask us to suggest one). We arrange cooks who regularly do that scale, because a cook who is excellent for thirty people is not automatically right for three hundred.

Per-plate rate is confirmed in writing before the date. Changes to headcount are normal — tell us as early as you can.', 2),
  ('Tent, Chairs & Seating',
   'Shamiana, chairs, tables and stage setup.',
   'Tent house arrangements — shamiana, chairs, tables, stage, carpet and lighting, delivered and set up.

Tell us the date, the venue and the headcount. We''ll arrange delivery the day before where the venue allows it, so nothing is being assembled while guests arrive.

Damage and delay terms are explained upfront so there are no surprises afterwards.', 3),
  ('Event Decoration',
   'Stage, entrance and hall decoration.',
   'Decoration for functions — stage backdrop, entrance arch, hall and car decoration.

Send a photo of anything you''ve seen and liked; that communicates far better than a description, and decorators quote more accurately from it.

Tell us the date and venue. Quote is confirmed before work begins.', 4),
  ('Event Photography',
   'Photo and video for functions.',
   'Photographers and videographers for weddings, functions and family occasions.

Tell us the date, the hours you need covered, and whether you want video as well. We''ll share what''s included — prints, album, edited video — because that''s where quotes usually differ rather than the day rate.

Advance and delivery timelines are agreed before booking.', 5),
  ('Priest Booking',
   'Purohit arranged for ceremonies.',
   'A purohit arranged for ceremonies — Gruhapravesam, Valaikappu, Manjal Neerattu Vizha, naming, and wedding rituals.

Tell us the ceremony, the date and time, and your family''s tradition, so we arrange someone who performs it the way you expect.

We''ll also pass on the list of items to arrange beforehand, so nothing is missing on the morning.', 6),
  ('Invitation Printing',
   'Wedding and function invitation cards.',
   'Invitation cards printed locally — wedding, house-warming, ear-piercing, birthday.

Send the wording and we''ll bring proofs before printing. Getting names and dates checked at proof stage is the whole point; a mistake found after printing means printing again.

Quantity, paper and price are confirmed with you first.', 7),
  ('Event Cleaning',
   'Venue cleaning before and after a function.',
   'Cleaning a venue or home before guests arrive and clearing up afterwards.

The after-function clear-up is the one people forget to arrange and most regret — tell us the venue and rough size and we''ll arrange enough hands to finish it the same night.

Price confirmed before the date.', 8)
) as v(name, short, long, ord)
where not exists (select 1 from public.products p where p.name = v.name);

-- ---------------------------------------------------------------------------
-- 4. Salon: appointments at real shops, not a service we perform
-- ---------------------------------------------------------------------------
update public.products
set name = 'Salon Appointment',
    description = 'Booked for you at a local salon.',
    description_long = 'We book your slot at a local salon — haircut, shave, facial, threading, bridal work — so you''re not waiting your turn on a busy day.

MyTown does not send anyone to your home for this: these are appointments at shops in town that you can see and judge for yourself. Tell us what you need and when, and we''ll confirm which salon and what time.

You pay the salon directly at their rate.',
    updated_at = now()
where name = 'Salon Haircut (at home)';

update public.products
set name = 'Threading & Waxing Appointment',
    description = 'Booked for you at a local salon.',
    description_long = 'A slot booked at a local salon for threading or waxing, at a time that suits you.

Tell us what you need and roughly when. We''ll confirm the salon and the time, and you pay them directly at their rate.',
    updated_at = now()
where name = 'Threading';

-- ---------------------------------------------------------------------------
-- 5. Local Assistance: one clear list of errands, now the trades have moved
-- ---------------------------------------------------------------------------
update public.products
set tags = array['local-service'], updated_at = now()
where category_id = (select id from public.categories where slug = 'assist');

update public.categories
set name = 'Local Help & Errands'
where slug = 'assist';

-- Cook stays an errand (someone cooking in your kitchen), not a trade.
update public.products
set description_long = 'A cook comes to your kitchen and prepares the day''s meal — useful during illness, after a birth, when guests are staying, or for elderly parents living alone.

Tell us how many people, roughly what you eat, and the time. Groceries can be bought by us beforehand if you''d rather not arrange them.

Rate is per meal and confirmed before the first visit.'
where name = 'Cook (per meal)' and description_long is null;

-- ---------------------------------------------------------------------------
-- 6. Category ordering with the two new categories in place
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
update public.categories set sort_order = 11 where slug = 'home-services';
update public.categories set sort_order = 12 where slug = 'events';
update public.categories set sort_order = 13 where slug = 'eseva';
update public.categories set sort_order = 14 where slug = 'rentals';

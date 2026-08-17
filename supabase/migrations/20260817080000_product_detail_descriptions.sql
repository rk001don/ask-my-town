-- Product detail: a long description, and real copy for the services.
--
-- Every product currently has at most a one-line `description`. That's enough
-- for a card, but not enough to decide from -- and for the assistance services
-- it isn't enough to even understand what's being offered. "Parent Assistance",
-- "Guest Pickup" and "Shopping Assistance" are titles, not explanations; a
-- customer reading them has no idea what would actually happen, what it costs,
-- or what we need from them.
--
-- `description_long` backs the product detail sheet. It answers three questions
-- in order: what this is, how it works, and what we need from you.

alter table public.products
  add column if not exists description_long text;

comment on column public.products.description_long is
  'Full description shown in the product detail sheet. Plain text, paragraphs separated by blank lines. Falls back to `description` when empty.';

-- ---------------------------------------------------------------------------
-- Assistance services -- the ones a one-liner genuinely fails
-- ---------------------------------------------------------------------------
update public.products set description_long =
  'Someone from MyTown visits your parents or elderly relatives at home and helps with whatever they need that day — collecting medicines, paying a bill, a bank or government office visit, or simply checking in and calling you afterwards.

Useful if you work away from Karimangalam and can''t be there yourself. We''ll call you after every visit and tell you honestly how they are.

Tell us their address, what they need help with, and a time that suits them. We''ll confirm on call before going.'
where name = 'Parent Assistance';

update public.products set description_long =
  'We receive your guest at the bus stand, railway station or drop point and bring them safely to your address — helpful when you can''t leave work or home.

Our staff will call your guest before they arrive so they know who to look for, and call you once they''ve been dropped off.

Share the arrival time, the pickup point and both phone numbers. Vehicle charges are confirmed with you before pickup.'
where name = 'Guest Pickup';

update public.products set description_long =
  'Tell us what you need and we''ll buy it from local shops for you — clothes, a gift, hardware, school supplies, anything available in and around Karimangalam.

We''ll send you photos and prices from the shop before paying, so you choose while sitting at home. Nothing is bought without your confirmation.

You pay the shop price plus our service charge on delivery. If it''s unavailable anywhere we''ll tell you rather than buying a substitute.'
where name = 'Shopping Assistance';

update public.products set description_long =
  'We stand in the queue for you — at a government office, a bank, an EB office or a hospital counter — and call you when it''s nearly your turn so you only need to arrive for the few minutes that require you in person.

Best for long-wait counters where most of the morning is spent simply waiting.

Tell us the office, the work involved and the day. We''ll confirm the timing and what documents you should carry.'
where name = 'Queue Standing';

update public.products set description_long =
  'Help with government paperwork end to end: which form applies, filling it correctly, arranging the supporting documents, and submitting it at the right office.

Covers certificates, applications, corrections and renewals. If a document is missing we''ll tell you what to arrange before we go, so a trip isn''t wasted.

Bring the details on a call and we''ll tell you honestly whether it''s something we can help with.'
where name = 'Government Office Assistance';

update public.products set description_long =
  'We collect a parcel or document from you and drop it at a courier office, or at an address within Karimangalam.

Good for anything that''s awkward to leave home for — a returned online order, documents to a relative, keys to a family member.

Tell us the pickup and drop points and roughly when. Courier charges, if any, are paid at actual and shown to you.'
where name = 'Parcel Pickup / Courier Drop';

update public.products set description_long =
  'Can''t find what you need listed? Describe it in your own words and we''ll tell you whether we can do it, what it will cost, and how long it takes.

Most requests in and around Karimangalam are possible — this exists so you never have to force what you want into a category that doesn''t fit.

There''s no charge for asking. We confirm everything on call before starting.'
where name = 'Custom Request';

-- ---------------------------------------------------------------------------
-- Pharmacy: the request-based framing needs stating plainly
-- ---------------------------------------------------------------------------
update public.products set description_long =
  'MyTown is not a pharmacy — we collect this for you from a licensed local chemist and deliver it.

Because of that, the price is whatever the chemist charges on the day, and we confirm it with you before buying. If they don''t stock it we''ll check another shop rather than substituting something different.

For anything prescription-only, keep the prescription ready: the chemist will ask for it, and we can''t collect the medicine without it.'
where is_service = true
  and show_price = false
  and category_id in (select id from public.categories where slug = 'pharmacy');

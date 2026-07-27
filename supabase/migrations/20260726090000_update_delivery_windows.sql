-- Replace the delivery window schedule with the requested one:
-- Morning 7-11, Afternoon 12-5, Dinner 6-10. Updates existing location
-- rows in place (config is just data, not something migrations should
-- re-INSERT and risk duplicating).
UPDATE public.locations
SET config = jsonb_set(
  config,
  '{delivery_windows}',
  '[
    {"label": "morning",   "start": "07:00", "end": "11:00", "cutoff": "06:30"},
    {"label": "afternoon", "start": "12:00", "end": "17:00", "cutoff": "11:30"},
    {"label": "dinner",    "start": "18:00", "end": "22:00", "cutoff": "17:30"}
  ]'::jsonb
)
WHERE config ? 'delivery_windows';

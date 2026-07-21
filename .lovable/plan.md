## MyTown v2 — Phase 1 Build Plan

Scope: everything from the HLD/LLD **except** wallets, payments (Razorpay), subscriptions, and their jobs. Plus the new **Schedule Order** feature on checkout.

---

### 1. Database migration (single migration)

**New tables** (all with GRANTs + RLS in the same migration):
- `locations` — one seed row for Karimangalam (`slug='karimangalam'`, `default_language='ta'`, `config` with `delivery_windows: [{label:'Morning',start,end,cutoff},{label:'Evening',...},{label:'Night',...}]`).
- `products` — real catalog with `price`, `show_price`, `payment_mode`, `is_service`, `is_subscription_eligible` (column kept, unused), `is_available`, `tags[]`, plus new `schedulable BOOLEAN DEFAULT true`.
- `delivery_batches` — keyed on `(location_id, window_label, scheduled_at::date)`.
- `riders` — service-role only; customer-facing reads via server fn that strips `id_proof_url`.
- `staff` — replaces the shared employee PIN with per-user rows tied to `auth.users`, with `role IN ('admin','ops','warden_viewer')` and optional `location_id` scope.
- `app_config` — key/scope/scope_id/value JSONB.
- `audit_log` — staff actions.
- `order_attachments` — links to Storage bucket.
- `group_orders` — floor/room shared cart.

**Alter existing tables:**
- `customers`: add `user_id UUID REFERENCES auth.users(id)`.
- `orders`: add `location_id`, `delivery_batch_id`, `group_order_id`, `payment_status` (default `'unpaid'`, kept for future), `subscription_id` (nullable, kept for future), `requested_date DATE DEFAULT CURRENT_DATE` with CHECK `BETWEEN CURRENT_DATE AND CURRENT_DATE + 2`, `requested_window TEXT`. Add owner-read RLS via `customers.user_id`.
- `order_items`: add `product_id UUID REFERENCES products(id)`.

**Skipped (Phase 2):** `wallets`, `wallet_transactions`, `payments`, `subscriptions`. `payment_mode`/`show_price` columns remain on `products` for forward-compat but no branching UI is built.

**Storage buckets:** `ask-attachments` (INSERT anon/auth, SELECT service_role), `rider-photos` (service_role only).

**Seed data (same migration):** one location, ~15-25 products across the existing 7 categories with sensible `price`, `show_price`, `is_service`, `schedulable` flags; a default `app_config` row for `languages_enabled`.

---

### 2. Server functions (extend `src/lib/api.functions.ts`)

New / updated:
- `getLocations()`, `getProducts({ categoryId, locationId })`.
- `createOrder(...)` — extend with `locationId`, optional `requestedDate`, `requestedWindow`, optional `attachmentPath` per item, optional `groupOrderId`. Validation:
  - `requestedDate` within `[today, today+2]` (server-recomputed).
  - If `requestedDate == today`, verify the chosen window's cutoff hasn't passed for the location (read from `locations.config.delivery_windows`).
  - Reject if any item's product has `schedulable = false` and date != today.
  - After insert, resolve/create the correct `delivery_batches` row for `(location, window, requested_date)` and set `orders.delivery_batch_id`.
- Rider display fn (strips `id_proof_url`), attachment upload signer, group-order create/join, staff-action helpers (write to `audit_log`).
- Migrate `employeeLogin`/`updateOrderStatus` to use the new `staff` table (kept PIN flow working via `mytown_verify_employee_pin` as a bridge, or swap to Supabase Auth email/password — see Technical Notes).

---

### 3. Checkout UI — Schedule Order

Edit `src/routes/checkout.tsx` only. Above the existing name/phone/address fields:

```text
[ Deliver ASAP ] [ Schedule ]        (segmented, ASAP selected by default)

  (expands inline when Schedule is tapped — no modal, no route)
  Choose a day
  [ Today, 21 Jul ]  [ Tomorrow, 22 Jul ]  [ Wed, 23 Jul ]

  Choose a window
  [ Morning ]  [ Evening ]  [ Night ]      (greyed + "closed" if cutoff passed)

  — existing form fields unchanged —
  [ Send my ask (n) ]                       (unchanged position + copy)
```

Rules:
- ASAP path sends the same payload as today (no `requestedDate`).
- Windows are read from the selected location's `config.delivery_windows`; cutoff comparison uses the user's local time but is re-validated server-side.
- Disabled pills are visibly greyed with a "closed" label, not hidden.
- Toggling back to "Deliver ASAP" clears the scheduling state.

---

### 4. Admin/staff console updates

- Staff Kanban already exists; extend it to show `requested_date` + `requested_window` chips on each card and to group future-dated batches separately from today's board (a small day-tab or section header — "Today · Morning / Evening / Night", "Tomorrow · …").
- Admin catalog editor for `products` (toggle `is_available`, `schedulable`, `show_price`, edit `price`, `tags`) — minimal table view, ops-only.

---

### 5. Acceptance checks (must pass before we call it done)

- Submitting checkout without touching the toggle produces the identical request as today.
- "Schedule" expands inline; no navigation occurs.
- A cutoff-passed window renders disabled, not missing, not tappable.
- Server rejects `today+3`, rejects scheduled non-`schedulable` items, rejects past-cutoff today windows — with clear messages, not raw Postgres errors.
- A scheduled order for tomorrow evening appears in the staff view under tomorrow's Evening batch, not today's.
- Existing anon checkout still works (no auth required for placing an order).

---

### Technical notes

- **Staff auth migration is a real decision.** The current app uses a shared PIN cookie. The spec's `staff` table assumes Supabase Auth users. Options: (a) keep PIN gate now, add `staff` table empty for Phase 2; (b) switch staff console to Supabase Auth email/password this phase. Recommend (a) to keep this build focused — flag in the plan for your call.
- **RLS for owner reads** uses `customers.user_id = auth.uid()`. Anonymous orders (no `user_id`) remain readable via the existing phone/orderId `trackOrder` server fn path — unchanged.
- **Batch assignment** runs inline inside `createOrder` for now (upsert the batch row). The separate lock/dispatch cron job from the HLD is out of scope this phase.
- **Cutoff times** are stored per window in `locations.config.delivery_windows[i].cutoff` (e.g., `"10:30"` for Morning). Server compares against `now() AT TIME ZONE locations.timezone`.
- **No new dependencies** required. No Razorpay SDK, no wallet UI, no cron setup.

---

### Open questions before I build

1. Staff auth: keep PIN gate for this phase, or migrate staff console to Supabase Auth email/password now?
2. Delivery-window cutoffs for Karimangalam — do you have real times (e.g. Morning cutoff 09:00, Evening 15:00, Night 19:00), or should I seed reasonable defaults you can edit later via `app_config`?
3. Product catalog seed — should I invent ~20 sensible products across the 7 categories (with prices), or leave the table empty and let you add via the admin editor?
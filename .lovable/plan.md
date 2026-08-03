# MyTown — Phase 3 Production Plan (planning only, no code changed)

## 1. Executive Summary

The app is a working assisted-commerce PWA (TanStack Start + Lovable Cloud). Three findings dominate this release:

1. **Order status updates are broken by a database CHECK constraint, not by code.** `orders_requested_date_range` (`requested_date >= CURRENT_DATE AND <= CURRENT_DATE + 2`) is a *table* check, so Postgres re-validates it on every UPDATE. All 24 existing orders have `requested_date < current_date`, so every status change on them fails. This is not legacy-only: any order becomes unchangeable the day after it was placed. **HIGH PRIORITY, Release 1.**
2. **Push is hard-wired to a single order.** Subscriptions live in `order_push_subscriptions(order_id, endpoint, …)`, so a device re-subscribes per order and there is no way to broadcast. Needs a generic device-subscription + notification/campaign model where "Order update" is one type.
3. **Service fee exists only in the cart.** It is snapshotted onto `orders.service_fee_estimate` at checkout but never displayed again anywhere (checkout, order detail, my-orders, staff, admin).

Plus: no cancellation flow, no image *remove*, and the cart is hard to reach on mobile. All work below is additive and incremental — no rewrites.

## 2. Existing Architecture Review

- **Routing/data**: file routes in `src/routes`, server logic in `src/lib/*.functions.ts`, admin/staff privileged work via `supabaseAdmin` inside handlers. Sound; keep.
- **Auth/roles**: `user_roles` + `has_role`/`is_staff` security-definer functions; staff verified in `staff.functions.ts:assertStaff` (direct `user_roles` read). Sound.
- **Orders**: `orders` (text id `MT-XXXXXX`) + `order_items` + `order_attachments`; anon insert allowed under a tight RLS check; reads scoped to owner or admin/ops.
- **Push**: `src/lib/webpush.server.ts` (WebCrypto VAPID + aes128gcm — correct for the Worker runtime, reusable as-is), `push.server.ts` (per-order fan-out), `NotifyMeButton` (per-order opt-in), `public/sw.js` (34 lines, single push handler, no notificationclick routing/actions/image).
- **Service fee**: `serviceFee.ts` tier math + `ServiceFeeBreakdown` component, used in cart only; tiers in `app_config.service_fee_tiers`.
- **Audit**: `audit_log.staff_id` FKs to `public.staff.id`, but code writes the *auth user id* and `staff` is empty (0 rows) — every audit insert silently fails (0 audit rows despite activity). Secondary bug.

## 3. Current Pain Points

| # | Pain | Severity |
|---|------|----------|
| 1 | Status change fails on any order older than today | Critical |
| 2 | Audit log silently records nothing | High |
| 3 | Push usable only for one order, per device, per order | High |
| 4 | No admin broadcast capability | High |
| 5 | Service fee invisible after cart → trust/billing disputes | High |
| 6 | No cancellation for customer/staff/admin | High |
| 7 | Images can be uploaded/replaced but never removed | Medium |
| 8 | Cart discoverability; bottom nav hidden on cart/checkout | Medium |
| 9 | Admin console is one long page; no orders view, no users/roles UI | Medium |

## 4. Root Cause Analysis

- **Status bug**: `orders_requested_date_range` CHECK is evaluated on UPDATE. Fix = drop the table check and enforce the date window only in the INSERT RLS policy (`insert_orders_anyone` already does exactly this). No data migration needed; no rewrite. Verify by re-running a status change on an existing order.
- **Audit bug**: FK mismatch (`audit_log.staff_id → staff.id`, code passes `auth.users.id`). Fix = repoint FK to `auth.users(id)` (or add `staff_user_id`), keeping existing rows valid (table is empty).
- **Push coupling**: schema keyed by `order_id` instead of device/user; permission prompt is tied to an order page.
- **Service fee**: single-use presentational component; no shared order-totals helper the other screens can call.

## 5. Proposed Architecture

**Notifications (generic, three layers)**

```text
device subscription (endpoint, user_id?, topics)
        ^ opt-in once, any screen
notification event  <- created by: admin campaign | order status change | system
        v fan-out (worker: WebCrypto sender, existing webpush.server.ts)
delivery log (per subscription: sent/failed/pruned)
```

- One permission prompt, one-time opt-in, surfaced globally (settings + a soft prompt after first order) instead of per-order.
- `type` enum: `order_update`, `delivery_update`, `offer`, `new_category`, `flash_sale`, `maintenance`, `service_update`, `festival`, `emergency`.
- Targeting resolved at send time: everyone / customers / staff / admins / (future) selected users.
- Order status changes call the same `enqueueNotification({type:'order_update', target:{userIds|orderId}})` path — order push becomes a caller, not a subsystem.
- Scheduling via `pg_cron` → `/api/public/hooks/dispatch-notifications` (documented pattern), draining due campaigns in batches.
- Keep Web Push now; the device table carries a `platform` column so FCM/mobile tokens slot in later with no schema break.

**Admin Notification Center** (`/admin` → Notifications tab): composer (title, body, optional image, deep link, category, target, send-now vs schedule), campaign list with status/counts, delivery log drill-down, and a "send test to me" action. Rich fields require an upgraded `sw.js` (image, icon, badge, `data.url`, `notificationclick` → focus/navigate).

**Cancellation**: single `cancelOrder` server function with role-aware rules — customer only while `status = 'received'` (and their own order), staff/ops with mandatory reason, admin anytime; writes `cancelled_by`, `cancelled_by_role`, `cancelled_at`, `cancellation_reason`, `refund_status` (default `not_applicable`), emits an `order_update` notification, and appears in the status timeline.

**Service fee**: extract a shared `getOrderTotals(order)` helper (items subtotal from `order_items.unit_price`, fee from `service_fee_estimate`, fallback to live tier calc when null) and one `OrderTotals` presentational component reused on every surface.

**Media**: `imageUrl` becomes nullable everywhere with an explicit `removeImage` action (clears the column, best-effort deletes the storage object) plus a shared `<ImageField>` (upload / preview / replace / remove / restore placeholder) and a guaranteed placeholder render path so no broken `<img>` can appear.

## 6. Database Changes

Release 1 (safety fixes, all reversible):
- `DROP CONSTRAINT orders_requested_date_range` (window still enforced by the INSERT RLS policy).
- Repoint `audit_log.staff_id` FK to `auth.users(id)`.

Release 2 (notifications):
- `push_devices(id, endpoint unique, p256dh, auth, user_id null, platform default 'web', topics text[], last_seen_at, created_at)`.
- `notification_campaigns(id, type, title, body, image_url, deep_link, category, target, target_filter jsonb, status: draft|scheduled|sending|sent|failed, scheduled_at, sent_at, created_by, created_at, updated_at)`.
- `notification_deliveries(id, campaign_id, device_id, status, error, created_at)`.
- Backfill `order_push_subscriptions` → `push_devices` (dedupe by endpoint), keep the old table read-only one release, drop in Release 5.
- RLS: no client reads on any of the three; writes via server functions only; admin reads through `supabaseAdmin` after role verification. Explicit GRANTs (`service_role` all; `authenticated` only where needed).

Release 3+ (orders):
- `orders`: `cancelled_at`, `cancelled_by uuid`, `cancelled_by_role text`, `cancellation_reason text`, `refund_status text default 'not_applicable'` (+ CHECK on allowed values — column-level, safe).
- Optional `orders.service_fee_final numeric` for staff-adjusted fees.
- `categories.image_url` / `products.image_url` already nullable — no change needed for removal.

## 7. API (server function) Changes

- New `src/lib/notifications.functions.ts`: `registerDevice`, `unregisterDevice`, `getNotificationPrefs`, `setNotificationPrefs`.
- New `src/lib/notifications-admin.functions.ts`: `createCampaign`, `updateCampaign`, `listCampaigns`, `sendCampaignNow`, `cancelCampaign`, `sendTestNotification`, `getCampaignStats` (all admin-verified).
- New `src/routes/api/public/hooks/dispatch-notifications.ts` for scheduled sends.
- `push.server.ts`: generalise to `sendToDevices(devices, payload)`; `sendPushForOrder` becomes a thin wrapper.
- `staff.functions.ts`: add `cancelStaffOrder`; return service-fee + totals fields in `listStaffOrders`.
- `api.functions.ts`: add `cancelMyOrder`; include fee/total in order-detail and my-orders payloads.
- `admin.functions.ts`: add `removeCatalogImage`; add admin order list/detail with totals.

## 8. UI Changes

- **Global**: `NotificationOptIn` (settings row + one-time soft prompt), upgraded `sw.js` (image, deep-link click routing, actions).
- **Admin**: Notifications tab (composer + campaign list + delivery stats), Orders tab with totals and admin cancel, `<ImageField>` with Remove on product/category rows.
- **Staff**: fee/total line on each order card; Cancel with reason dialog.
- **Customer**: fee/total on checkout summary, order detail, my-orders, and order confirmation; "Cancel order" button visible only while `received`; cancellation reason + timestamp in the timeline.

## 9. Mobile UX Improvements (one-handed)

- **Cart access (recommended, matches Swiggy/Blinkit/Zomato)**: a persistent **floating cart bar** above the bottom nav on all browse screens — item count, total, "View cart" — with a spring-in animation and an animated badge on quantity change. Keep the bottom nav visible; the current fix hides nav on `/cart`, `/checkout`, `/order/*`, which solves the tap-overlap but costs navigation. Replace that with correct z-index + `pb-[calc(nav+safe-area)]` spacing so the Continue CTA sits above the nav instead of the nav disappearing.
- Sticky checkout CTA with a summary line (items + total) rather than a bare "Continue".
- Mini-cart sheet from the header badge for quick quantity edits without leaving the category.
- Thumb-zone rule: every primary action within the bottom 35% of the viewport; 44px minimum targets; reduce checkout to one scroll (ASAP default, schedule collapsed).
- Reorder from my-orders in one tap; recent items row on Home.

## 10. Admin UX Improvements

- Split the 914-line `admin.tsx` into tabs/child routes: Dashboard · Orders · Catalog (products/categories) · Users & Roles · Notifications · Settings.
- Dashboard KPIs: today's orders by status, revenue + fees, failed notifications, top search terms with zero results.
- Orders: filter by date/status/window, inline status change, cancel with reason, totals column, CSV export.
- Users & Roles: grant/revoke `admin`/`ops`/`warden_viewer` from the UI (today it is manual SQL) with the phone+PIN guard trigger respected.
- Catalog: bulk availability toggle, sort-order drag, image remove, "missing image" filter.
- Settings: edit service-fee tiers and delivery windows from `app_config` instead of SQL.

## 11. Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Drop date CHECK | Low | Window still enforced on INSERT via RLS; verify with a rejected past-date insert |
| audit_log FK repoint | Low | Table empty |
| New notification tables | Low | Additive; no existing reads touched |
| Broadcast sending | **High (user-visible)** | Test-send to admin only, then a staged rollout cap (e.g. 50 devices/batch), rate limit, no auto-retry loops |
| Cancellation | Medium | Server-side role/state guards; status transitions validated; no destructive deletes |
| Cart UX change | Medium | Restore bottom nav carefully; visual regression check at 390px and 320px |
| Admin route split | Medium | Move components file-by-file, keep `/admin` URL stable |

## 12. Regression Risks

- Hiding/restoring bottom nav can re-introduce the original overlap bug → re-verify Cart, Checkout, Order pages on 390px.
- Generalising `push.server.ts` could break existing order pushes → keep `sendPushForOrder` signature.
- Adding fee/total fields to `listStaffOrders` changes the payload shape → additive fields only.
- New `orders` columns must stay optional so the anon insert RLS policy keeps passing.
- Dropping `order_push_subscriptions` too early would lose already-opted-in devices → backfill and verify counts before drop.

## 13. Dependencies

- Existing: VAPID secrets (set), `webpush.server.ts`, `catalog-images`/`ask-attachments` buckets, `user_roles`/`has_role`.
- New: `pg_cron` + `pg_net` for scheduled campaigns; a `notification-images` bucket (or reuse `catalog-images`) served via the existing public image proxy route; optional `framer-motion` for cart/badge motion.
- No FCM dependency now; `platform` column reserves the path.

## 14. Recommended Release Order

1. **Release 1 — Critical fixes**: drop the date CHECK, fix the audit FK, verify status changes on all 24 existing orders. Smallest, highest value, ship first.
2. **Release 2 — Service fee everywhere**: shared totals helper + `OrderTotals` on checkout, order detail, my-orders, staff, admin. Read-only, near-zero risk.
3. **Release 3 — Cart & mobile UX**: floating cart bar, restored bottom nav with correct spacing, sticky checkout CTA.
4. **Release 4 — Notification platform**: device model + backfill, generic sender, global opt-in, upgraded service worker, order updates rerouted through it.
5. **Release 5 — Admin Notification Center + cancellation + media management**: composer, scheduling, campaign stats; cancellation for customer/staff/admin; `<ImageField>` with remove; then drop `order_push_subscriptions`.
6. **Release 6 (optional) — Admin console split + reports.**

## 15. Estimated Complexity

| Release | Complexity | Surface |
|---|---|---|
| 1 | XS | 1 migration |
| 2 | S | 1 helper, 1 component, 5 screens |
| 3 | M | 3 components, 4 routes |
| 4 | L | 3 tables, 2 function modules, sw.js, backfill |
| 5 | L | admin UI + cancellation across 3 roles + media |
| 6 | M | refactor only |

## 16. Testing Strategy

- **Release 1**: status transition on a legacy order through the staff console; confirm an `audit_log` row appears; confirm a past-dated insert is still rejected.
- **Release 2**: fee/total identical across cart → checkout → confirmation → my-orders → staff → admin for the same order, including the "price on request" (fee = null) case.
- **Release 3**: Playwright at 390×844 — Continue is tappable, no nav overlap, badge updates, cart reachable from every browse screen.
- **Release 4**: opt-in once → subscription row; order status change delivers; dead endpoint (410) pruned; SSR-safe (no `window` at import).
- **Release 5**: send test to admin only; scheduled campaign fires once (no duplicates); cancellation permission matrix (customer after confirmation must fail); image remove leaves a placeholder, never a broken `<img>`.
- Regression smoke on every release: Home, Explore, Category, Search, Cart, Checkout, Order, My orders, Staff, Admin → 200 + no console errors; `tsgo --noEmit` and production build clean.

## 17. Rollback Strategy

- Each release is one migration + one code change, independently revertable.
- Release 1: re-adding the CHECK is possible but undesirable — safe because the INSERT policy already enforces the rule.
- Release 4/5: new tables are additive; reverting code leaves them unused. Keep `order_push_subscriptions` until Release 5 verifies the backfill.
- Campaign sending gated behind a feature flag in `app_config` so broadcasts can be disabled instantly without a deploy.
- Publish preview first, verify, then promote.

## 18. Definition of Done

- Status changes succeed for every existing and new order; audit rows written.
- Service fee and total shown identically on all ten listed surfaces (invoice/reports included where they exist).
- One notification permission prompt per device; all nine notification types deliverable; order updates flow through the generic pipeline.
- Admin can compose, target, schedule, send, and inspect delivery stats — with a test-send path.
- Cancellation works for customer (pre-confirmation), staff (with reason), admin (anytime), with actor/time/reason recorded, notification sent, timeline updated.
- Every image field supports upload/preview/replace/remove/placeholder; zero broken images.
- Cart reachable in one tap from every browse screen; no overlapping tap targets at 320–430px.
- Typecheck + production build clean; smoke suite green; rollback documented per release.

Nothing was modified — awaiting your approval on scope and release order before any implementation.

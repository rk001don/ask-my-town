# MyTown — Phase 0 Discovery / Production Audit

**Date:** 2026-08-11
**Scope:** Read-only discovery. No code was changed while producing this document.
**Repo:** `rk001don/ask-my-town` — live at https://ask-my-town.lovable.app

---

## 0. Executive Summary

MyTown is **not a prototype** — it's a real, working assisted-commerce PWA with genuine server-side authorization, RLS-backed data access, a real order/checkout pipeline, delivery batching, and a push-notification system. It was built with Lovable (TanStack Start + Supabase/"Lovable Cloud") and shows a history of real production fixes already (UTC delivery-window bug, order-status CHECK-constraint bug, audit-log FK bug — see `.lovable/plan.md`, already partially executed via migrations `20260804090000`/`20260804091000`).

The core job now is **hardening and polish, not rebuilding**: close two real security gaps (open `INSERT` RLS policies on `orders`/`customers`, an unauthenticated/unrate-limited order-lookup endpoint), add the missing "did my click register?" feedback loop on ~6 specific buttons, finish two features that were scaffolded but never wired up (notification broadcast dispatch, `service_fee_final`), fix one concrete mobile CSS bug (notification composer button row), remove Lovable-default branding gaps (OG image, apple-touch-icon, canonical URL), and clean up dead schema/dead dependencies.

**Top 3 findings, in order of severity:**

1. **P0 — Two RLS policies let anyone insert bare `orders`/`customers` rows directly via the Supabase anon key**, bypassing `createOrder`'s pricing, rate-limiting, and delivery-batch logic entirely (`supabase/migrations/20260720055335...sql`, policies `insert_customers_anyone`/`insert_orders_anyone` never dropped, unlike the equivalent `order_items`/`order_attachments` policies which were dropped in `20260726033141`).
2. **P0 — No order-status transition guard exists anywhere** (DB, RLS, or server function). Both `updateStaffOrderStatus` (`src/lib/staff.functions.ts:94-145`) and the legacy `updateOrderStatus` (`src/lib/api.functions.ts:779-801`) accept any status value regardless of current status — a stale UI, a buggy retry, or a direct API call can jump `received → completed` or regress `completed → received`.
3. **P0 — Reliability/UX defect matches the user's own report**: at least 5 primary action buttons (staff order-advance, admin batch-advance, admin config save, admin product delete, notification composer's own action row on mobile) have no `disabled`/loading guard during their mutation, so rapid taps can double-fire status changes, batch advances, or config saves with no server-side idempotency to catch it.

**Bottom line:** the architecture is sound and worth keeping. The work is a focused hardening pass, not a rewrite — consistent with the "no new functionality by default" mandate.

---

## 1. Current Architecture

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19) + TanStack Router (file-based routes, `src/routeTree.gen.ts` generated) |
| Build | Vite 8, wrapped by `@lovable.dev/vite-tanstack-config` (bundles Nitro server target, Tailwind v4 plugin, VITE_* env injection) |
| Styling | Tailwind CSS v4 + a centralized OKLCH design-token system in `src/styles.css` (single dark theme, no light/dark toggle by design) |
| UI kit | shadcn/ui primitives on Radix (`src/components/ui/*`) |
| Data/state | TanStack Query (server cache) + a hand-rolled `useSyncExternalStore` cart store (`src/lib/cart-store.ts`), no Redux/Zustand |
| Backend | Supabase (Postgres + Auth + Storage), accessed via `@supabase/supabase-js`; privileged mutations run through TanStack Start **server functions** (`src/lib/*.functions.ts`) using a service-role client (`src/integrations/supabase/client.server.ts`), never exposed to the browser |
| Auth | Supabase Auth — Google OAuth, email/password, and a phone+PIN flow; JWT verified server-side per request via `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts:33-109`) |
| Push | Hand-rolled WebCrypto Web Push (VAPID + aes128gcm) in `src/lib/webpush.server.ts`, because the runtime target doesn't support the `web-push` npm package |
| Deployment target | Nitro/Cloudflare (per `vite.config.ts` wrapper defaults); no CI workflow files exist in the repo (`.github/` absent) |
| Package manager | **Both `bun.lock` and `package-lock.json` are committed** — `bunfig.toml` confirms bun is intended; the npm lockfile is a drift/confusion risk with nothing enforcing which is authoritative |

**Routing map** (file-based, `src/routes/`):

| Route | Purpose |
|---|---|
| `/` | Home — hero, popular picks, categories, how-it-works |
| `/explore` | Full category grid |
| `/search` | Debounced search over categories + products |
| `/c/$slug` | Category page (products + subcategories) |
| `/cart` | Cart review, quantity, notes, fee breakdown |
| `/checkout` | Delivery details, scheduling, order submission |
| `/order/$orderId` | Public order confirmation/tracking page (no auth required, `robots: noindex`) |
| `/activity` | Track-by-phone/order-ID for guests; auto order list if signed in |
| `/auth` | Sign-in/up (Google, email/password, phone+PIN) |
| `/_authenticated/my-orders` | Authenticated order list + cancel |
| `/admin` | Single-file admin console (1,325 lines), tab-switched: Dashboard / Catalog / Notifications / Config / Delivery |
| `/staff` | Order board for staff/ops (status advance, cancel) |
| `/employee` | Legacy redirect shim → `/staff` (kept for compatibility) |

Bottom navigation (customer): **Home / Explore / Orders** (`src/components/AppShell.tsx:8-12`), floating pill nav on mobile, sidebar on `md+`. Cart and Sign-in live only as header icons, not in the bottom nav.

---

## 2. Current Database Model

Reconstructed from all 30 migrations in `supabase/migrations/` plus `src/integrations/supabase/types.ts`.

**Order flow tables:** `customers`, `orders` (text ID `MT-XXXXXX`), `order_items` (price-snapshotted at insert), `order_attachments`, `rate_limit_hits`.

**Catalog/config:** `categories` (self-referential via `parent_id`, two-level), `products`, `locations`, `app_config` (key/scope/value jsonb, gated by `is_public`), `service_fee_tiers` (stored inside `app_config`).

**Access control:** `user_roles` + `app_role` enum (`admin, ops, warden_viewer, customer`) — this is the **live** role system, checked server-side by `assertAdmin`/`assertStaff` on every privileged server function. A **second, unused legacy role system** (`staff` table, `role IN ('admin','ops','warden_viewer')`) still exists in the schema and is not read by any current app code — dead schema that invites confusion about which table is authoritative.

**Delivery:** `delivery_batches` (`open → locked → dispatched → delivered`, plus `cancelled`), unique on `(location_id, window_label, scheduled_date)`. `riders` and `group_orders` tables are fully scaffolded (RLS on, FKs from `orders`) but have **zero CRUD anywhere in the app** — dead schema.

**Notifications:** two parallel systems coexist — the legacy per-order guest subscription (`order_push_subscriptions`) still used by every staff status update, and a newer account-based system (`push_devices`, `notification_campaigns`, `notification_deliveries`) built for admin broadcast but never finished (see §6).

**Auth/audit:** `employees` (legacy PIN/bcrypt table, still seeded with a default PIN `482571`, still has a live, callable server endpoint even though no UI links to it — see §11), `audit_log` (FK bug fixed in `20260804090000`).

**RLS posture:** genuinely enforced, not just UI-hidden, for the vast majority of tables — but two anon `INSERT` policies on `orders`/`customers` were never cleaned up after the rest of the checkout path was hardened (see §11, P0).

**Storage buckets:** `ask-attachments` (private, admin/ops read-only), `catalog-images` (migration creates it `public: true`, but a code comment in `admin.functions.ts:348-350` claims it's private and proxied — this inconsistency should be reconciled before touching image handling).

---

## 3. Current Order Lifecycle

DB enum `order_status`: `received, confirmed, arranging, on_the_way, completed, cancelled` (unchanged since `20260720052016.sql`).

**Customer-facing today** (`src/lib/constants.ts:12-29`) — **"Arranging" is already visible to customers**, just relabeled:

| DB status | Customer label | Customer copy |
|---|---|---|
| `received` | Received | "We got your ask — our team is on it." |
| `confirmed` | Confirmed | "Confirmed. We're preparing it now." |
| `arranging` | **Preparing** | "Getting your items ready." |
| `on_the_way` | Out for delivery | "Heading to your address." |
| `completed` | Delivered | "Delivered. Anything else?" |
| `cancelled` | Cancelled | "This order was cancelled." |

This is an important correction to the assumed starting state: the raw word "arranging" never leaks into customer UI today (verified via full-repo grep — the only English-prose hit is unrelated marketing copy in `ServiceFeeBreakdown.tsx:63`). The product decision to **collapse to 4 customer-facing steps** (Received → Confirmed → Out for delivery → Delivered) is a real, deliberate simplification of the *existing 6-status model down to 4*, not a bug fix — tracked as a P1 recommendation in §12, to be implemented carefully because of the gap below.

**State-machine enforcement — the actual gap:** there is no CHECK constraint, trigger, or server-side transition map for `orders.status` anywhere in the codebase. Order advancement is enforced **only by which single button the staff UI happens to render** (`src/routes/staff.tsx:73-77,152-159` computes one "next" step from a hardcoded array and shows one button) — the server functions that actually perform the write (`staff.functions.ts:94-145`, `api.functions.ts:779-801`) accept **any** enum value from the client with no ordering check. Contrast: `delivery_batches` status *does* have a real server-side next-status map (`admin.functions.ts:312-346`) that rejects invalid advances — orders should get the same treatment.

Cancellation is the one order-status path with a real invariant: `cancelMyOrder` (customer) only allows cancelling `received` orders (`auth.functions.ts:135-137`); a DB CHECK (`orders_cancellation_state_check`, `20260804091000.sql`) requires `cancelled_at` + `cancellation_reason` together. Staff/admin cancellation has no equivalent state restriction (can cancel anytime, which may be intentional per the original brief's "internal states may have more flexibility" — worth confirming as a product decision, not assuming it's a bug).

---

## 4. Current User Flows

- **Home** (`src/routes/index.tsx`): brand header → hero with tagline + category-chip rail → **Popular Picks** (a **hardcoded 16-item array**, `index.tsx:40-159`, disconnected from the live `products` table — real prices/availability can drift from what's shown) → live Categories grid → "How it works" 4-step trust section. No dedicated "Need Anything?" block inline on the home body — that flow is only reachable via the global floating `AskFAB`, not surfaced as its own home section (matches the brief's Phase 19 recommendation to give it a proper section, but today it is not missing entirely — it's just FAB-only).
- **Catalog model**: two-level `categories` (parent/child via `parent_id`) + a flat `products` table. **There is no true product-variant model.** "Idli — 2 pcs" vs "Idli — 4 pcs" would today have to be two separate `products` rows with the size baked into the name string, not a parent product with linked variants. This is the single biggest catalog-architecture gap relative to the target vision in the brief (Phase 7's variant examples) and needs a real design decision before Phase 7-style catalog work starts (see §12).
- Seeded categories (`supabase/migrations/20260720052016...sql`, `20260802093000_phase2_tamil_nadu_catalog.sql`): Food & Home Meals, Daily Essentials, Pharmacy & Personal Care, e-Seva & Documentation, Local Assistance, Local Services, Rentals, Bakery, Juices & Beverages, Desserts, Cakes, Snacks, Fruits — already a close match to the brief's target taxonomy, with different exact naming ("Pharmacy & Personal Care" vs "Personal Care", "e-Seva & Documentation" vs "e-Seva"). "Need Anything" is intentionally not a real category row — it's the freeform-ask flow, which is correct, but it's listed as a fake `POPULAR_PICKS` entry on Home which mixes a UI affordance into what looks like a product grid.
- **Icon bug**: seeded category icon keys `croissant`, `ice-cream`, `cake` are absent from `src/components/icon-map.ts`'s map, silently falling back to a generic `HelpCircle` icon for Bakery/Desserts/Cakes whenever no `image_url` is set — a small but real visual bug, cheap to fix.
- **Search** (`src/routes/search.tsx`): 220ms debounce, 2-char minimum, stale-response cancellation guard — solid engineering. Matching is `ilike` substring/synonym-expansion (`expandTerms()`), not fuzzy/typo-tolerant — "idly" → "Idli" style synonyms depend entirely on what's been manually added to `expandTerms`.
- **Cart/checkout**: cart quantity changes are local-store-only (no network call needed, correctly has no loading state). **Checkout submit is properly guarded** — explicit `busy` state, disabled button, spinner, client-side validation before any network call (`checkout.tsx:90,141,198,406`). No idempotency key is sent, so a genuine network-retry scenario (not just double-click, which *is* covered) could theoretically still double-submit — low risk, worth a cheap idempotency-key fix.
- **Order tracking**: consistent, friendly copy already exists (see §3 table) — this part of the brief's Phase 23 ask is largely already done.
- Every **server-backed** mutation reviewed (checkout submit, order cancel, image upload, push subscribe, guest order tracker) has an idle/loading/success/error cycle with a disabled button during the request. Every **purely local** mutation (add-to-cart, quantity +/-) correctly has none needed. The **one gap**: `AskFAB`'s "Add to my ask" submit button has no busy-state guard, though impact is low (synchronous local write).
- **Images**: `loading="lazy"` + `onError` fallback-to-icon pattern used consistently across `ProductCard`/`ItemCard`/`CategoryTile` — no broken-image risk found. All catalog/attachment images are self-hosted on Supabase Storage; no hotlinked competitor or third-party image domains exist anywhere in the codebase.
- **Accessibility**: icon-only buttons consistently carry `aria-label` (back, search, cart, WhatsApp, remove-item, qty stepper, close-sheet) — this is already in good shape, contrary to a "generic AI template" assumption. Veg/non-veg indicator relies partly on color alone (green/red dot) with an aria-label as the only non-visual cue — worth a shape/icon backup for colorblind users.
- **Error/loading state coverage gap**: `checkout.tsx` is the one route missing a route-level `errorComponent` that almost every other route has; a failed `locations`/service-fee-config fetch on checkout has no distinguishable "failed to load" UI (the schedule picker just shows "Loading windows…" forever).

---

## 5. Current Admin & Staff Flows

`/admin` is a single 1,325-line file with client-side tabs (Dashboard, Catalog, Notifications, Config, Delivery) — no sub-routes, no user/role-management UI at all (roles must be granted via direct SQL today).

- **Order status changes happen on `/staff`, not `/admin`** — admin has no order view. Staff board renders exactly one "Mark {next status}" button per order (good anti-error pattern — no dropdown of arbitrary target statuses) but **that button has no disabled/loading guard**, so a fast double-tap during the board's 15-second poll window can fire `updateStaffOrderStatus` twice before the UI refreshes — and per §3, the server has no transition guard to catch it either. This is the most direct match to the user-reported "sluggish, needs multiple taps" symptom, because a slow network makes the unguarded window even wider.
- **Delivery batching**: real server-side next-status enforcement exists (`BATCH_NEXT_STATUS`, `admin.functions.ts:312-346` — rejects advancing an already-`delivered` batch). The batch-advance button in the UI, however, also has no in-flight-mutation disabled state (only a business-rule disabled state), so duplicate requests can still be *sent*, they're just correctly *rejected* server-side — better than orders, but still worth the same UI fix for a clean tap experience. No partial-delivery UI exists inside a batch (can't mark some orders delivered and others not on the same trip).
- **Notification composer**: fields for type/audience/title/message/category/deep-link/schedule/image exist; validation exists client- and server-side. **The mobile layout bug the user reported has a concrete, specific root cause**: `admin.tsx:1252`, the row wrapping the "Send test"/"Save"/"Schedule" buttons, is a `flex gap-2` with **no `flex-wrap`** and no `min-w-0`/truncation on the buttons, pinned right via `ml-auto` — on a ~320-375px screen the two button labels plus padding can exceed the available width. This is a localized, one-line-class bug, not a systemic layout-architecture problem: the rest of the page (`ConfigRow`, the composer's own field grids) already correctly uses `flex-col …sm:flex-row` / responsive grid patterns that collapse properly below `sm:`. **Fix is small and targeted, not a redesign.**
- **The notification broadcast feature is scaffolded but not finished**: `createCampaign` only inserts a `draft`/`scheduled` row (`notifications-admin.functions.ts:13-69`); nothing anywhere in the codebase ever transitions a campaign to `sending`/`sent` or fans it out via `notification_deliveries`. Only `sendTestNotification` (admin's own device only) actually sends a push. An operator can compose and "save" a broadcast today with no indication it will never be delivered — this is a trust-breaking gap that should either be finished or the UI should clearly label it "not yet available" until it is.
- **Config/settings tab**: flat, ungrouped list of `app_config` rows, each edited as **raw JSON text** (e.g., typing `["ta","en"]` by hand) with no typed inputs (no boolean toggle, no multi-select) and **no disabled/loading state on Save** — same double-submit exposure as the staff status button, on a screen where a bad rapid double-save could plausibly race two conflicting values.
- **Authorization is real, not cosmetic**: every admin/staff server function independently re-verifies the caller's role server-side against `user_roles` (`assertAdmin`/`assertStaff`), backed by RLS — client-side route/tab gating is UX convenience, not the actual security boundary. This is a genuinely solid foundation to build on.
- **Category name editing is unreachable**: `updateCategory` supports a `name` patch server-side, but the admin UI only wires up image upload for categories — a small UI gap, not a backend one.

---

## 6. Current Notification Lifecycle

Two systems coexist:

1. **Legacy, per-order, guest** — `order_push_subscriptions` (keyed by `order_id` + endpoint). `sendPushForOrder` fires automatically on every staff status change (`staff.functions.ts:131-143`), best-effort/non-throwing. **No idempotency key** — a retried or double-fired status update sends the same push twice, since uniqueness is only `(order_id, endpoint)`, not per notification event.
2. **New, account-based, broadcast-oriented** — `push_devices` / `notification_campaigns` / `notification_deliveries`, built specifically for the admin Notification Center, but **the dispatch worker was never built** (see §5). This is the single most "half-finished feature" in the codebase and should be either completed or clearly gated off before it's advertised to real operators.

Both share the same low-level Web Push sender (`webpush.server.ts`, hand-rolled WebCrypto — correct choice for the edge runtime, don't replace it).

---

## 7. Current Delivery Lifecycle

`delivery_batches`: `open → locked → dispatched → delivered` (+ `cancelled`), one batch per `(location_id, window_label, scheduled_date)`, auto-created/attached the first time an order lands in that window (`createOrder`, `api.functions.ts:383-397,647-673`). Real per-location timezone conversion (`zonedTimeToUtcISO`) — this was previously buggy and has already been fixed, per the plan doc and migration history. Admin can Lock / Mark dispatched / Mark delivered per batch, server-enforced next-status only — solid design. Gaps: no manual batch creation/split/merge UI, no per-order partial-delivery checklist within a batch, and the batch-order attachment step is a separate round-trip from the order insert (not atomic — a rare race window under concurrent same-window orders, low real-world impact given current order volume).

---

## 8. Current Catalog Structure

See §4 for full detail. Summary: two-level category tree + flat products table with **no first-class variant/unit model** — this is the key architectural decision needed before any Phase 6-11-style catalog expansion (multiple sizes/units per dish) can be done cleanly without creating dozens of near-duplicate product rows.

---

## 9. Performance Problems

| # | Problem | Evidence |
|---|---|---|
| 1 | Duplicate-mutation risk from missing disabled/loading states (the user's reported "sluggish, needs 2 taps" symptom) | `staff.tsx:152-159` (order advance), `admin.tsx:704-712` (batch advance), `admin.tsx:1125-1130` (config save), `admin.tsx:1001-1045` (product delete post-confirm), `admin.tsx:1252` composer buttons |
| 2 | Three heavy dependencies (`recharts`, `embla-carousel-react`, `react-resizable-panels`) are installed and wrapped in shadcn components but have **zero importers anywhere in `src/`** — dead weight in the install and (if any wrapper is ever accidentally imported) the bundle | `package.json:54,61-62`; confirmed via repo-wide grep for their wrapper components |
| 3 | Google Fonts loaded via runtime CDN `<link>` (not self-hosted) — a render-blocking third-party round-trip on every load, partially mitigated by `preconnect` | `src/routes/__root.tsx:110-115` |
| 4 | Dual lockfiles (`bun.lock` + `package-lock.json`) risk dependency-version drift between environments, with no CI to catch it | repo root; no `.github/` workflows found |
| 5 | No CLS-safety via explicit `width`/`height` on `<img>` tags (relies on fixed-size wrapper divs instead) | `ProductCard.tsx`, `ItemCard.tsx`, `CategoryTile.tsx` |

No slow-query or missing-index evidence was found in the tables reviewed; order/product/category volumes are small enough today that this isn't yet an observed problem, but `trackOrder`'s unindexed-feeling public lookup (see §11) is worth revisiting if traffic grows.

---

## 10. UX Problems

- Popular Picks on Home is a static, hand-maintained array disconnected from real catalog data/pricing (§4) — the brief's own Phase 17 goal of a "future-ready, data-driven popularity score" has no supporting instrumentation yet (no `orders_count`/`add_to_cart_count` tracking exists in the schema).
- No live product-variant selector UX — today "buy 2pcs vs 4pcs" would require browsing to two separate near-duplicate product cards rather than picking a variant on one product page.
- Notification composer has no send preview and no way to edit/cancel/resend a saved campaign from the history list (read-only list).
- Config tab requires hand-typed JSON with no inline validation feedback beyond a generic error toast — slow and error-prone for a settings screen meant to be touched without a deploy.
- `AskFAB` ("Need Anything?") is not given its own section on the Home page body — it's a floating action button only, which under-sells what the brief calls the app's central differentiator.

## 11. Visual / Branding Problems

- Title (`"MyTown — Need Anything? MyTown!"`) and meta description are **already properly MyTown-branded**, not generic Lovable defaults (`src/routes/__root.tsx:71-83`) — this part of the brief's Phase 1/34 concern is largely already solved.
- `og:image`/`twitter:image` both point at the 64×64 SVG monogram (`/mytown-icon.svg`), not a proper 1200×630 raster social-card image — social previews will render poorly or blank on platforms with inconsistent SVG support.
- **No dedicated PNG `apple-touch-icon`** — iOS "Add to Home Screen" points at the SVG, which iOS Safari does not reliably rasterize. A 180×180 PNG is the standard fix.
- Manifest only declares two icon entries (SVG "any" + one 512×512 PNG) — no 192×192 PNG, which some Android install-prompt heuristics expect explicitly.
- **No `canonical` link tag anywhere** in the app (zero hits repo-wide) — an SEO gap.
- `sitemap.xml` generates **relative, not absolute, URLs** (`BASE_URL` hardcoded to `""` in `src/routes/sitemap[.]xml.ts:4`), which is invalid per the sitemap protocol; `robots.txt` also doesn't reference the sitemap at all.
- Design-token system is genuinely centralized (`src/styles.css`, OKLCH tokens, explicit "never write ad-hoc colors" comment) and is followed almost everywhere — only real outliers are the veg/non-veg indicator dot (`ProductCard.tsx:87,92`, hardcoded hex instead of `--success`/`--danger` tokens) and the logo SVG gradient (duplicated as literal hex in both `MyTownLogo.tsx` and `public/mytown-icon.svg` rather than referencing the CSS tokens — a future rebrand needs two edits instead of one). This is a much better starting point than a typical "generic AI template."
- "Lovable" branding audit: **no user-facing Lovable branding was found** anywhere in the shipped app (no default favicon, no `lovable.app` references, no visible "powered by Lovable" UI). Every hit is either a legitimate infra dependency (`@lovable.dev/cloud-auth-js`, the real auth SDK — do not remove), an internal dev-facing comment/doc (`AGENTS.md`, `.lovable/plan.md`), or a telemetry hook (`lovable-error-reporting.ts`) forwarding runtime errors to the Lovable editor — harmless, not user-visible. The **one string a real user could ever see** is a Supabase-misconfiguration error message that mentions "Lovable Cloud" (`src/integrations/supabase/client.ts:41` etc.), and only in an ops-failure state, not normal operation. **Net finding: Phase 1's "remove Lovable branding" work is largely already done** — remaining work is the OG image/apple-touch-icon/canonical gaps above, which are generic PWA/SEO hygiene, not de-Lovable-ing.

---

## 12. Security Concerns

| # | Concern | Detail | Priority |
|---|---|---|---|
| 1 | Anon `INSERT` RLS policies on `orders`/`customers` were never dropped | `insert_customers_anyone`/`insert_orders_anyone` (`20260720055335`) let anyone with the public anon key create bare order/customer rows directly via PostgREST, bypassing `createOrder`'s pricing, rate-limiting, and batching entirely. The equivalent policies on `order_items`/`order_attachments` *were* correctly dropped in `20260726033141` — this looks like an incomplete cleanup, not an intentional design. | **P0** |
| 2 | `trackOrder` has no rate limiting | Public, unauthenticated, uses the service-role client to bypass RLS, over a 6-hex-char order-ID space (~16.7M) — enables brute-force enumeration of customer name/phone/address/order contents. Every other sensitive public endpoint (`createOrder`) is rate-limited; this one was missed. | **P0** |
| 3 | No order-status transition guard server-side | See §3 — any staff/admin-authenticated caller (correct role, but via a crafted request rather than the UI) can set any status on any order. | **P0** |
| 4 | Orphaned legacy PIN-login endpoint still live | `employeeLogin`/`updateOrderStatus` (`api.functions.ts:723-801`) has no UI route pointing at it anymore but is still a callable server function against the still-seeded `employees` table, which still has a **default PIN `482571`** seeded in migrations and no PIN-attempt rate limiting. | **P1** |
| 5 | `service_role` key confinement | Verified clean — confined to `client.server.ts` (server-only), never imported client-side, enforced by an ESLint rule blocking cross-boundary imports. No secret leakage found. | — (already good) |
| 6 | Dual role-system schema (`staff` table vs `user_roles`) | Not itself a vulnerability today (only `user_roles` is read by live code), but a latent risk if a future change reads the wrong table. | **P2** |

---

## 13. Mobile Problems

- Confirmed root cause of the reported admin notification-page misalignment: a single unwrapped `flex gap-2` button row (`admin.tsx:1252`) — see §5. Fix is a targeted `flex-wrap` + button sizing change, not a layout rewrite.
- Delivery-window picker buttons in checkout use `py-1.5` padding, likely rendering under the 44px recommended touch-target size, inconsistent with the `min-h-11` pattern used elsewhere in the same app (`checkout.tsx:283-312`).
- Z-index layering for sticky elements (bottom nav, floating cart bar, `AskFAB`, sticky footers) is set ad hoc per-file (`z-30/40/50/60` scattered across `cart.tsx`, `checkout.tsx`, `AppShell.tsx`) rather than centralized — no observed collision today, but risky for the next person adding a sticky element.
- `checkout.tsx`'s sticky-footer clearance (`pb-40`) is a fixed value against a footer whose actual height can grow when fee-breakdown text wraps on narrow screens — could under-clear content on very small viewports.
- Overall the codebase already follows correct responsive patterns in most places (`flex-col …sm:flex-row`, `grid …sm:grid-cols-N`) — the mobile problems found are localized bugs in specific components, not a systemic architecture failure, which means fixes should be targeted rather than a blanket "redesign every screen."

---

## 14. Broken / Fragile Functionality

| # | Item | Status |
|---|---|---|
| 1 | Notification broadcast dispatch (campaigns never actually send) | Scaffolded, not wired — §6 |
| 2 | `service_fee_final` column | Exists in schema, referenced defensively in staff UI, but nothing ever sets it — silently always falls back to `service_fee_estimate` | 
| 3 | Category icon fallback for `croissant`/`ice-cream`/`cake` keys | Missing map entries → generic `HelpCircle` icon shown instead |
| 4 | `catalog-images` bucket public/private inconsistency | Migration creates it public; a code comment claims it's private/proxied — needs reconciling before touching image handling |
| 5 | `riders`, `group_orders` tables | Fully scaffolded, zero CRUD anywhere — dead schema |
| 6 | `staff` legacy role table | Superseded by `user_roles`, unused by live code — dead schema |
| 7 | Push-notification duplicate-send risk on status change | No idempotency key on `sendPushForOrder`; a retried status update can double-notify a customer |

---

## 15. Recommended Fixes, Prioritized

### P0 — Must fix (security / data-integrity / matches the user's own reliability complaint)

1. Drop (or add a proper `WITH CHECK`/replace with a server-function-only path for) the `insert_customers_anyone`/`insert_orders_anyone` anon RLS policies so raw orders can no longer be created outside `createOrder`.
2. Add rate limiting to `trackOrder`, matching the existing pattern already used by `createOrder`.
3. Add a server-side order-status transition map (mirroring the existing, working `BATCH_NEXT_STATUS` pattern in `admin.functions.ts`) to `updateStaffOrderStatus`/`updateOrderStatus`, rejecting invalid jumps.
4. Add `disabled`/loading-state guards to the ~6 identified unguarded mutation buttons: staff order-advance, admin batch-advance, admin config save, admin product delete (post-confirm), notification composer's own buttons, `AskFAB` submit.
5. Fix the notification composer's mobile button-row overflow (`admin.tsx:1252`, add `flex-wrap` + responsive button sizing) — the specific, already-diagnosed root cause of the reported admin mobile misalignment.

### P1 — Important

6. Decide and implement the customer-facing 6→4 status collapse (Received/Confirmed/Out for delivery/Delivered), keeping the richer internal states for staff — now that the underlying transition-guard work (item 3) exists to do this safely.
7. Finish or clearly gate off the notification-broadcast dispatch path — don't let operators believe a "saved" campaign will send when it can't yet.
8. Remove or properly rate-limit + PIN-attempt-guard the orphaned legacy employee PIN-login endpoint; rotate/remove the seeded default PIN.
9. Add a real 1200×630 OG image, a PNG apple-touch-icon (180×180), a 192×192 manifest icon, a `canonical` tag, and fix the sitemap's relative-URL bug + reference it from `robots.txt`.
10. Design a first-class product-variant/unit model before doing any Phase 6–11-style catalog expansion, so "Idli 2pcs / 4pcs" becomes one product with variants instead of duplicate rows.
11. Reconcile catalog-images bucket public/private status between the migration and the code comment.
12. Add a client-side idempotency key to `createOrder` for genuine network-retry protection (distinct from the already-solid double-click guard).

### P2 — Polish

13. Remove the three unused heavy dependencies (`recharts`, `embla-carousel-react`, `react-resizable-panels`) and their shadcn wrapper components.
14. Resolve the dual-lockfile situation (commit to bun, delete `package-lock.json`, add a `.env.example`).
15. Fix the `croissant`/`ice-cream`/`cake` icon-map gap.
16. Convert the config tab from raw-JSON text inputs to typed controls (toggle for booleans, multi-select for arrays) grouped by category.
17. Give "Need Anything?" its own inline section on the Home page body, not just the floating FAB.
18. Make Popular Picks data-driven (even a simple manually-curated-but-DB-backed list beats a hardcoded array disconnected from real prices/availability).
19. Centralize sticky-element z-index tokens instead of ad hoc per-file values.
20. Fix checkout's missing route-level error boundary and the delivery-window touch-target sizing.

### P3 — Future (explicitly not implemented now, per "no new functionality by default")

21. Real popularity scoring (`orders_count`/`add_to_cart_count`/conversion tracking) to replace the static Popular Picks array with data.
22. Admin user/role management UI (currently SQL-only).
23. Notification campaign edit/cancel/resend from the history list; send preview.
24. Per-order partial-delivery checklist inside a batch.
25. Drop dead schema (`staff`, `riders`, `group_orders`) once confirmed truly unused, with a proper migration.

---

## 16. Implementation Plan

This plan sequences the fixes above into safe, independently-shippable releases, following the skill's CAVEMEN discipline (verify → smallest safe change → measure → regression-check) and the "no new functionality by default" rule. Each release should end with lint + typecheck + build + a manual smoke pass on the affected flows before moving to the next.

**Release 1 — Security & data-integrity (P0 items 1–3)**
Close the anon-insert RLS gap, rate-limit `trackOrder`, add the order-status transition guard. Zero UI change; verify with a rejected raw-PostgREST insert attempt and a rejected invalid staff status jump. Highest value, lowest visible risk.

**Release 2 — Reliability / the reported sluggishness bug (P0 items 4–5)**
Add disabled/loading state to every identified unguarded button; fix the notification composer's mobile flex-wrap bug. Directly addresses the user's own complaint. Test via the button-reliability protocol (single tap, rapid double-tap, tap-during-loading) on each of the six buttons, at 320/375/390px.

**Release 3 — Branding/PWA/SEO hygiene (P1 items 9)**
New OG image, apple-touch-icon, manifest icon size, canonical tag, sitemap absolute-URL fix. Self-contained, no business-logic risk.

**Release 4 — Order lifecycle simplification (P1 item 6)**
Now that Release 1 added a real transition guard, safely collapse the customer-facing timeline to 4 steps while preserving the 6-state internal model, delivery batching, and cancellation rules. Test every valid and invalid transition per the brief's Phase 5 testing ask.

**Release 5 — Notification platform completion or gating (P1 item 7) + legacy endpoint cleanup (P1 item 8)**
Either finish the campaign dispatcher (device fan-out + delivery logging) or hide/disable the "Send"/"Schedule" actions until it's real — operator trust matters more than a half-working feature. Remove or lock down the orphaned PIN-login endpoint.

**Release 6 — Catalog variant model (P1 items 10–11)**
Design work first (data model for variants/units), then migrate a small pilot set of products (e.g., Idli, Dosa) before expanding catalog content — this unblocks all of the brief's later catalog phases (7–11) without creating duplicate-row sprawl.

**Release 7 — Cleanup & polish (P2 items 13–20)**
Dependency pruning, lockfile fix, icon-map fix, config tab typed inputs, Home page "Need Anything" section, data-backed Popular Picks, z-index tokens, checkout error boundary.

**Deferred (P3)** — documented as future enhancements per the skill's rule, not implemented without an explicit go-ahead: popularity scoring, admin role-management UI, campaign edit/resend, partial-delivery UI, dead-schema removal.

---

*This document reflects the state of the repository at commit `86839e8` on branch `claude/mytown-discovery-audit-f7fo6v`. No code was modified in producing it.*

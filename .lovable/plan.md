
## What ships

The complete "I need something → MyTown confirmed my order" loop, end-to-end against Lovable Cloud, mobile-first from 390px, PWA-installable, every screen with skeleton/empty/error/populated states.

## Stack decisions (locked from your answers)

- Backend: **Lovable Cloud** (Postgres + auth + server functions). No Google Sheets.
- Town: **Karimangalam**. Header quick-contact opens WhatsApp deep link to **+91 80722 83367**, pre-filled with the same "Ask MyTown" text as the FAB.
- Brand: spec default — CRED-leaning dark base, glass surfaces, warm amber accent, confident display font + legible body.
- Employee PIN: I'll generate a secure PIN and show it to you once after build (stored hashed with bcrypt server-side; you can rotate anytime).

## Data model (Postgres, replaces the Sheets tables)

- `customers` (id, name, phone, address, landmark, created_at)
- `orders` (id human-readable `MT-XXXXXX`, customer_id, status enum, notes, assigned_employee_id, timestamps)
- `order_items` (id, order_id, item_name, category, subcategory, quantity, notes, is_freeform)
- `employees` (id, name, pin_hash, active) — seeded with one row
- `categories` (id, name, parent_id, icon_key, sort_order) — seeded with §6 taxonomy
- `search_analytics` (id, term, normalized_term, result_count, created_at)
- Status enum: `received | confirmed | arranging | on_the_way | completed`
- RLS: `customers`/`orders`/`order_items` insert-open to anon for order creation, select-by-phone-or-order-id via server function only. `employees` locked (server-only). `categories` public read. Grants written per stack rules.

## Server functions (replace the Apps Script API contract)

- `searchItems({ q })` — fuzzy + synonym match over categories/items, logs to `search_analytics`, returns matches + suggestion list
- `getCategories()` / `getSubcategories({ categoryId })`
- `createOrder({ customer, items, notes })` → `{ orderId }`
- `trackOrder({ phone?, orderId? })` → order + items + status history
- `employeeLogin({ pin })` → issues short-lived signed session cookie
- `listEmployeeOrders()` / `updateOrderStatus({ orderId, status })` — PIN-session gated

## Routes (TanStack Start file-based)

```
/                       Home (brand header, hero, popular picks, categories grid, how it works)
/explore                Explore (all categories, reference-style header)
/c/$categoryId          Category → item grid (2-col cards, inline +/- stepper)
/search                 Search page (recent/trending, live suggestions, no-results → Ask sheet)
/cart                   Review (item rows, notes, "X items added", Continue)
/checkout               Customer details form
/order/$orderId         Confirmation (order id, summary, timeline, CTAs)
/activity               Tracking (by phone or order id, status stepper, past orders)
/employee               PIN gate → Kanban board (New / Assigned / Confirmed / Completed)
```

Bottom nav: Home · Explore · Activity. Ask MyTown = global FAB → bottom sheet, reachable on every customer route. Cart icon lives in header with live badge (Zustand store, persisted to localStorage).

## Design system

- Tokens in `src/styles.css` `@theme`: `--bg-base/elevated/glass`, `--accent-primary` (warm amber) / `--accent-secondary`, semantic text + status colors, all in oklch.
- Fonts loaded via `<link>` in `__root.tsx`: display = **Sora**, body = **Inter Tight** (both from Google Fonts).
- Card radius 20px, pill CTAs, two-layer soft shadows, backdrop-blur glass on sticky headers/sheets.
- Motion: framer-motion for card stagger, sheet spring, cart badge bounce, stepper press; skeleton shimmer via CSS; `prefers-reduced-motion` respected.
- shadcn primitives customized via variants — no ad-hoc `text-white`/`bg-[#...]` in components.

## State coverage

Every data screen gets a shaped skeleton, an empty state with next action (empty cart → Explore + Ask), a retryable error state, and the populated state. Ask FAB is auto-opened (pre-filled) from search no-results and category empty states.

## PWA

Manifest-only installability (spec doesn't ask for offline). Icons, theme color, `display: standalone`, apple-touch-icon in `__root.tsx` head. Meta/OG per route.

## Out of scope (deferred to v2, matches §5)

Admin analytics, category management UI, wishlist, filter/sort, employee stats, ratings, chat, push, i18n, desktop redesign, Account tab.

## Build order

1. Enable Lovable Cloud + migrations (schema, RLS, grants, seed categories + employee row).
2. Design system (`styles.css`, fonts, tokens, shadcn variants).
3. Layout shell: `__root.tsx` head/PWA/meta, bottom nav, header with cart badge, Ask FAB + sheet, cart store.
4. Server functions + Zod validators.
5. Home → Explore → Category → Search (with all 4 states each).
6. Cart Review → Checkout → Confirmation.
7. Activity tracking.
8. Employee PIN gate + Kanban.
9. Polish pass: motion, skeletons, empty states, WhatsApp deep link, verify 390px, sitemap/robots, head metadata per route.
10. Smoke-test the full loop end-to-end via Playwright.

## Definition of done

Full loop works against live Cloud backend, every screen passes the 4-state check, PWA installs, employee board updates status live, Ask FAB reachable everywhere and feeds the same cart, nothing from the OUT list snuck in, no prices/discounts/totals anywhere.

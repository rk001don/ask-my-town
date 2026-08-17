// All MyTown server functions. Callable from routes/components via useServerFn or directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { failFrom, userError } from "@/lib/errors";
import { isValidIndianPhone, normalizeIndianPhone } from "@/lib/phone";
import type { ServiceFeeTiers } from "@/lib/serviceFee";
import { computeServiceFee } from "@/lib/serviceFee";

// ----- shared schemas -----
const OrderStatus = z.enum([
  "received",
  "confirmed",
  "arranging",
  "on_the_way",
  "completed",
  "cancelled",
]);

const CustomerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => isValidIndianPhone(v), "Enter a valid 10-digit mobile number")
    .transform((v) => normalizeIndianPhone(v)),
  address: z.string().trim().min(6, "Address is too short").max(400),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
});

const OrderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  itemName: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(280).optional(),
  isFreeform: z.boolean(),
  attachmentPath: z.string().trim().max(500).optional(),
});

// =============================================================================
// Locations
// =============================================================================
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.VAPID_PUBLIC_KEY ?? null };
});

const PushSubscriptionSchema = z.object({
  orderId: z.string().trim().min(3).max(20),
  endpoint: z.string().trim().min(10).max(600),
  p256dh: z.string().trim().min(1).max(300),
  auth: z.string().trim().min(1).max(300),
});

export const subscribeToOrderPush = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof PushSubscriptionSchema>) =>
    PushSubscriptionSchema.parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Confirm the order actually exists before storing a subscription for it
    // -- keeps this endpoint from being usable to spam-store arbitrary rows.
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.orderId.toUpperCase())
      .maybeSingle();
    if (!order) throw userError("We couldn't find that order. Check the ID and try again.");
    const { error } = await supabaseAdmin.from("order_push_subscriptions").upsert(
      {
        order_id: order.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      { onConflict: "order_id,endpoint" },
    );
    if (error)
      failFrom(
        "subscribeToOrderPush",
        error,
        "We couldn't turn on updates for this order. Please try again.",
      );
    return { ok: true as const };
  });

export const getLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, name, slug, default_language, timezone, config")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) failFrom("getLocations", error, "We couldn't load delivery areas. Please try again.");
  return data ?? [];
});

export const getServiceFeeConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("value")
    .eq("key", "service_fee_tiers")
    .eq("scope", "global")
    .maybeSingle();
  if (error)
    failFrom("getServiceFeeConfig", error, "We couldn't load service charges. Please try again.");
  return (data?.value as ServiceFeeTiers | undefined) ?? null;
});

// =============================================================================
// Products
// =============================================================================
export const getProducts = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { categorySlug?: string; locationId?: string; tag?: string; limit?: number }) =>
      z
        .object({
          categorySlug: z.string().max(80).optional(),
          locationId: z.string().uuid().optional(),
          tag: z.string().trim().max(80).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("products")
      .select(
        "id, category_id, name, description, image_url, price, currency, show_price, payment_mode, is_veg, is_service, is_available, schedulable, sort_order, tags, categories(name, icon_key)",
      )
      .eq("is_available", true)
      .order("sort_order", { ascending: true });

    if (data.categorySlug) {
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .is("parent_id", null)
        .maybeSingle();
      if (!cat) return [];
      query = query.eq("category_id", cat.id);
    }
    if (data.locationId) {
      query = query.or(`location_id.is.null,location_id.eq.${data.locationId}`);
    }
    if (data.tag) {
      query = query.contains("tags", [data.tag]);
    }
    if (data.limit) {
      query = query.limit(data.limit);
    }
    const { data: rows, error } = await query;
    if (error) failFrom("getProducts", error, "We couldn't load this menu. Pull down to refresh.");
    return rows ?? [];
  });

// =============================================================================
// Categories
// =============================================================================
export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, parent_id, icon_key, image_url, sort_order")
    .is("parent_id", null)
    .order("sort_order", { ascending: true });
  if (error) failFrom("getCategories", error, "We couldn't load categories. Pull down to refresh.");
  return data ?? [];
});

export const getSubcategories = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parent, error: pErr } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, icon_key, image_url")
      .eq("slug", data.slug)
      .is("parent_id", null)
      .maybeSingle();
    if (pErr)
      failFrom("getCategoryTree", pErr, "We couldn't load this category. Please try again.");
    if (!parent) return { parent: null, items: [] };

    const { data: items, error: cErr } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, icon_key, image_url, sort_order")
      .eq("parent_id", parent.id)
      .order("sort_order", { ascending: true });
    if (cErr)
      failFrom(
        "getCategoryTree.children",
        cErr,
        "We couldn't load this category. Please try again.",
      );
    return { parent, items: items ?? [] };
  });

// =============================================================================
// Search
// =============================================================================
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Lightweight synonym map — expandable
const SYNONYMS: Record<string, string[]> = {
  medicine: ["med", "meds", "pharmacy", "tablet", "tablets", "medicines"],
  food: ["meal", "meals", "eat", "eating", "tiffin"],
  groceries: ["grocery", "provisions", "kirana"],
  vegetables: ["veggies", "veg", "sabzi", "greens"],
  fruits: ["fruit"],
  bike: ["twowheeler", "twowheeler", "scooter", "moped"],
  car: ["cab", "taxi", "vehicle"],
  cook: ["cooking", "chef"],
  clean: ["cleaning", "housekeeping"],
  plumber: ["plumbing", "pipe", "leak"],
  electrician: ["electric", "wiring", "current"],
  ac: ["airconditioner", "aircon"],
  ticket: ["tickets", "booking"],
};

function expandTerms(q: string): string[] {
  const base = normalize(q).split(" ").filter(Boolean);
  const out = new Set<string>(base);
  for (const t of base) {
    for (const [key, list] of Object.entries(SYNONYMS)) {
      if (key === t || list.includes(t)) {
        out.add(key);
        list.forEach((v) => out.add(v));
      }
    }
  }
  return [...out];
}

export const searchItems = createServerFn({ method: "GET" })
  .inputValidator((data: { q: string }) => z.object({ q: z.string().max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raw = data.q.trim();
    if (!raw) return { results: [], term: raw };

    const terms = expandTerms(raw);
    const orExpr = terms
      .filter((t) => t.length >= 2)
      .map((t) => `name.ilike.%${t}%,slug.ilike.%${t}%`)
      .join(",");

    let results: Array<{
      id: string;
      name: string;
      slug: string;
      parent_id: string | null;
      icon_key: string | null;
      parent_name?: string | null;
      parent_slug?: string | null;
    }> = [];

    if (orExpr) {
      const { data: rows, error } = await supabaseAdmin
        .from("categories")
        .select("id, name, slug, parent_id, icon_key")
        .or(orExpr)
        .limit(40);
      if (error)
        failFrom(
          "searchItems.categories",
          error,
          "Search is unavailable right now. Please try again.",
        );
      results = rows ?? [];
    }

    // Attach parent info for subcategory results
    const parentIds = [...new Set(results.map((r) => r.parent_id).filter(Boolean) as string[])];
    if (parentIds.length) {
      const { data: parents } = await supabaseAdmin
        .from("categories")
        .select("id, name, slug")
        .in("id", parentIds);
      const map = new Map(parents?.map((p) => [p.id, p]) ?? []);
      results = results.map((r) => {
        const p = r.parent_id ? map.get(r.parent_id) : null;
        return { ...r, parent_name: p?.name ?? null, parent_slug: p?.slug ?? null };
      });
    }

    // Also search the real priced catalog (products), not just categories --
    // otherwise searching "biryani" never finds the actual "Chicken Biryani" row.
    let productResults: Array<{
      id: string;
      name: string;
      price: number | null;
      show_price: boolean;
      image_url: string | null;
      category_id: string;
      category_slug?: string | null;
      category_name?: string | null;
      is_veg?: boolean | null;
      description?: string | null;
    }> = [];
    const productOrExpr = terms
      .filter((t) => t.length >= 2)
      .map((t) => `name.ilike.%${t}%`)
      .join(",");
    if (productOrExpr) {
      const { data: prodRows, error: prodErr } = await supabaseAdmin
        .from("products")
        // Enough to render a real search row (thumbnail, veg mark, category)
        // rather than a bare name-and-price line.
        .select(
          "id, name, description, price, show_price, image_url, is_veg, category_id, categories(slug,name,icon_key)",
        )
        .or(productOrExpr)
        .eq("is_available", true)
        .limit(20);
      if (prodErr)
        failFrom(
          "searchItems.products",
          prodErr,
          "Search is unavailable right now. Please try again.",
        );
      productResults = (prodRows ?? []).map((p) => {
        const cat = p.categories as { slug: string; name: string; icon_key: string | null } | null;
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          show_price: p.show_price,
          image_url: p.image_url,
          is_veg: p.is_veg,
          category_id: p.category_id,
          category_slug: cat?.slug ?? null,
          category_name: cat?.name ?? null,
        };
      });
    }

    // Log analytics fire-and-forget
    await supabaseAdmin.from("search_analytics").insert({
      term: raw,
      normalized_term: normalize(raw),
      result_count: results.length + productResults.length,
    });

    return { results, productResults, term: raw };
  });

/**
 * What people are actually searching for, from the last 14 days.
 *
 * `search_analytics` has been recorded on every search since launch and never
 * read once -- the "Trending" chips were a hardcoded array that had drifted
 * out of date (it still offered categories that no longer exist). This reads
 * the real thing.
 *
 * Only terms that FOUND something are suggested: proposing a search we know
 * returns nothing would be a dead end. (Zero-result terms are valuable too,
 * but as a demand signal for the admin, not as a suggestion to customers.)
 */
export const getTrendingSearches = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("search_analytics")
    .select("normalized_term, term, result_count, created_at")
    .gte("created_at", since)
    .gt("result_count", 0)
    .limit(1000);
  // Suggestions are a nicety -- a failure here should leave the search page
  // working, not error it out.
  if (error) return [];

  const counts = new Map<string, { label: string; n: number }>();
  for (const row of data ?? []) {
    const key = (row.normalized_term || row.term || "").trim();
    if (key.length < 3) continue;
    const existing = counts.get(key);
    if (existing) existing.n += 1;
    else counts.set(key, { label: (row.term || key).trim(), n: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((c) => c.label);
});

// =============================================================================
// Create order (with optional scheduling)
// =============================================================================
type DeliveryWindow = { label: string; start: string; end: string; cutoff: string };

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return { h, m: m || 0 };
}

// Compute "now" in a given IANA timezone as { date: YYYY-MM-DD, h, m }
function nowInTz(tz: string): { dateStr: string; h: number; m: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    h: parseInt(parts.hour, 10) % 24,
    m: parseInt(parts.minute, 10),
  };
}

function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Convert a local wall-clock time (YYYY-MM-DD + HH:MM) in a given IANA timezone
// into the correct UTC instant. Needed because `new Date("2026-07-24T07:00:00")`
// is parsed in the SERVER's local time (UTC on Vercel), not the location's timezone —
// that bug previously made every delivery_batches.scheduled_at wrong by the IST offset.
function zonedTimeToUtcISO(dateStr: string, hm: string, tz: string): string {
  const { h, m } = parseHM(hm);
  const [y, mo, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const guessUtcMs = Date.UTC(y, mo - 1, d, h, m);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]),
  );
  const hour24 = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
  const asIfUtcMs = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour24,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  const offsetMs = guessUtcMs - asIfUtcMs;
  return new Date(guessUtcMs + offsetMs).toISOString();
}

// Given the current time in `tz` and the location's configured windows, find the
// window that's currently open (or the next one still open today), for the "Deliver
// ASAP" path — so ASAP orders get batched too, not just explicitly-scheduled ones.
function currentOrNextWindow(
  windows: DeliveryWindow[],
  nowH: number,
  nowM: number,
): DeliveryWindow | null {
  const nowMin = nowH * 60 + nowM;
  const withCutoff = windows
    .map((w) => ({ w, cut: parseHM(w.cutoff) }))
    .map(({ w, cut }) => ({ w, cutMin: cut.h * 60 + cut.m }));
  const open = withCutoff.find(({ cutMin }) => nowMin < cutMin);
  return open?.w ?? null;
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      customer: z.infer<typeof CustomerSchema>;
      items: z.infer<typeof OrderItemSchema>[];
      notes?: string;
      locationId?: string;
      requestedDate?: string;
      requestedWindow?: string;
      idempotencyKey?: string;
    }) =>
      z
        .object({
          customer: CustomerSchema,
          items: z.array(OrderItemSchema).min(1, "Add at least one item"),
          notes: z.string().trim().max(500).optional(),
          locationId: z.string().uuid().optional(),
          requestedDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          requestedWindow: z.string().trim().min(1).max(40).optional(),
          idempotencyKey: z.string().trim().min(10).max(100).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A genuine network-retry (not a double-click, which the client already
    // guards against) can re-send the exact same submit. If this key already
    // produced an order, return that order instead of creating a duplicate.
    if (data.idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existing) return { orderId: existing.id };
    }

    // Resolve location: caller-supplied or fallback to first active
    let locationId = data.locationId;
    let locTz = "Asia/Kolkata";
    let windows: DeliveryWindow[] = [];
    {
      const { data: loc, error: locErr } = locationId
        ? await supabaseAdmin
            .from("locations")
            .select("id, timezone, config")
            .eq("id", locationId)
            .maybeSingle()
        : await supabaseAdmin
            .from("locations")
            .select("id, timezone, config")
            .eq("active", true)
            .order("name")
            .limit(1)
            .maybeSingle();
      if (locErr)
        failFrom(
          "createOrder.location",
          locErr,
          "We couldn't confirm the delivery area. Please try again.",
        );
      if (!loc) throw userError("We're not delivering in this area yet.");
      locationId = loc.id;
      locTz = loc.timezone || "Asia/Kolkata";
      const cfg = (loc.config ?? {}) as { delivery_windows?: DeliveryWindow[] };
      windows = cfg.delivery_windows ?? [];
    }

    // Validate scheduling against server clock, not client
    const nowTz = nowInTz(locTz);
    const today = nowTz.dateStr;
    const tomorrow = addDaysISO(today, 1);
    const dayAfter = addDaysISO(today, 2);
    const requestedDate = data.requestedDate ?? today;
    if (![today, tomorrow, dayAfter].includes(requestedDate)) {
      throw userError("Pick a delivery date within the next three days.");
    }

    let requestedWindow: string | null = data.requestedWindow ?? null;
    let batchWindow: string | null = null; // window actually used for delivery_batches assignment
    if (requestedWindow) {
      const win = windows.find((w) => w.label.toLowerCase() === requestedWindow!.toLowerCase());
      if (!win) throw new Error(`Unknown delivery window: ${requestedWindow}`);
      requestedWindow = win.label;
      if (requestedDate === today) {
        const { h, m } = parseHM(win.cutoff);
        const nowMin = nowTz.h * 60 + nowTz.m;
        const cutMin = h * 60 + m;
        if (nowMin >= cutMin) {
          throw userError(
            `Sorry, the ${win.label} window has closed for today. Please pick a later window.`,
          );
        }
      }
      batchWindow = requestedWindow;
    } else if (requestedDate === today && windows.length) {
      // "Deliver ASAP" path: the customer didn't pick a window, so `requested_window`
      // correctly stays null (don't misrepresent this as a scheduled order in the UI) —
      // but we still resolve the currently-open window purely to attach this order to a
      // delivery batch, so batching covers ASAP orders too, not only explicitly-scheduled ones.
      const auto = currentOrNextWindow(windows, nowTz.h, nowTz.m);
      batchWindow = auto?.label ?? null;
    }

    // Enforce schedulable flag per product for future-dated orders
    if (requestedDate !== today) {
      const productIds = data.items.map((i) => i.productId).filter(Boolean) as string[];
      if (productIds.length) {
        const { data: prods, error: pErr } = await supabaseAdmin
          .from("products")
          .select("id, name, schedulable")
          .in("id", productIds);
        if (pErr)
          failFrom(
            "createOrder.priceLookup",
            pErr,
            "We couldn't confirm item prices. Please try again.",
          );
        const blocked = (prods ?? []).find((p) => !p.schedulable);
        if (blocked)
          throw userError(
            `"${blocked.name}" can't be scheduled ahead. Please choose "Deliver ASAP" or remove it.`,
          );
      }
    }

    // Basic abuse protection: no more than 8 orders per phone number per 10 minutes.
    // There's no reliable client IP in this handler, so phone is the best available
    // identifier; this still meaningfully blocks a script hammering createOrder.
    // (data.customer.phone is already normalized to bare 10 digits by CustomerSchema.)
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("mytown_check_rate_limit", {
      p_bucket: `create_order:${data.customer.phone}`,
      p_max_hits: 8,
      p_window_seconds: 600,
    });
    if (rlErr)
      failFrom(
        "createOrder.rateLimit",
        rlErr,
        "We couldn't place your order right now. Please try again.",
      );
    if (!allowed) {
      throw userError(
        "Too many orders placed recently from this number. Please wait a few minutes and try again.",
      );
    }

    // Upsert customer by phone
    const phone = data.customer.phone;
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    let customerId = existing?.id;
    if (!customerId) {
      const { data: inserted, error } = await supabaseAdmin
        .from("customers")
        .insert({
          name: data.customer.name,
          phone,
          address: data.customer.address,
          landmark: data.customer.landmark || null,
        })
        .select("id")
        .single();
      if (error)
        failFrom(
          "createOrder.customer",
          error,
          "We couldn't save your details. Please check them and try again.",
        );
      customerId = inserted!.id;
    } else {
      await supabaseAdmin
        .from("customers")
        .update({
          name: data.customer.name,
          address: data.customer.address,
          landmark: data.customer.landmark || null,
        })
        .eq("id", customerId);
    }

    // Generate order id
    const { data: orderIdRow, error: idErr } = await supabaseAdmin.rpc("mytown_new_order_id");
    if (idErr)
      failFrom("createOrder.orderId", idErr, "We couldn't create your order. Please try again.");
    const orderId = orderIdRow as unknown as string;

    // Snapshot the price actually charged, resolved server-side from the real
    // products table — a client-supplied price is never trusted here, since that
    // would let a tampered request pay ₹1 for a ₹200 item. Resolved before the
    // orders insert now so the service fee (computed from this same subtotal)
    // can be snapshotted onto the order too, not just recomputed live later.
    const priceableProductIds = data.items
      .map((i) => i.productId)
      .filter((id): id is string => !!id);
    const priceByProductId = new Map<string, number | null>();
    if (priceableProductIds.length) {
      const { data: priced } = await supabaseAdmin
        .from("products")
        .select("id, price")
        .in("id", priceableProductIds);
      (priced ?? []).forEach((p) => priceByProductId.set(p.id, p.price));
    }
    const pricedSubtotal = data.items.reduce((sum, i) => {
      const price = i.productId ? priceByProductId.get(i.productId) : null;
      return price != null ? sum + price * i.quantity : sum;
    }, 0);
    let serviceFeeEstimate: number | null = null;
    {
      const { data: feeConfigRow } = await supabaseAdmin
        .from("app_config")
        .select("value")
        .eq("key", "service_fee_tiers")
        .eq("scope", "global")
        .maybeSingle();
      serviceFeeEstimate = computeServiceFee(
        pricedSubtotal,
        (feeConfigRow?.value as ServiceFeeTiers | undefined) ?? null,
      );
    }

    // Insert order (client-facing insert policy forbids delivery_batch_id; write it as a separate update below via service role — but service role bypasses RLS so the initial insert can include location/date fields)
    const { error: orderErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "received",
      notes: data.notes || null,
      location_id: locationId,
      requested_date: requestedDate,
      requested_window: requestedWindow,
      service_fee_estimate: serviceFeeEstimate,
      idempotency_key: data.idempotencyKey ?? null,
    });
    if (orderErr) {
      // Unique-violation on idempotency_key means a concurrent retry of this
      // exact submit already won the race and created the order -- return
      // that order rather than surfacing an error for what the customer
      // experiences as one successful checkout.
      if (orderErr.code === "23505" && data.idempotencyKey) {
        const { data: raced } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("idempotency_key", data.idempotencyKey)
          .maybeSingle();
        if (raced) return { orderId: raced.id };
      }
      failFrom(
        "createOrder.insertOrder",
        orderErr,
        "We couldn't place your order. Please try again in a moment.",
      );
    }

    // Insert items
    const { data: insertedItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(
        data.items.map((i) => ({
          order_id: orderId,
          product_id: i.productId || null,
          item_name: i.itemName,
          category: i.category || null,
          subcategory: i.subcategory || null,
          quantity: i.quantity,
          notes: i.notes || null,
          is_freeform: i.isFreeform,
          unit_price: i.productId ? (priceByProductId.get(i.productId) ?? null) : null,
        })),
      )
      .select("id");
    if (itemsErr) {
      // The order row already exists at this point. Leaving it would put an
      // itemless "phantom" order on the staff board that nobody can fulfil,
      // while the customer is told the order failed -- the two sides would
      // disagree about reality. Roll it back so the failure is clean, then
      // report it. Postgres has no cross-statement transaction available over
      // PostgREST, so this compensating delete is the rollback.
      await supabaseAdmin.from("orders").delete().eq("id", orderId);
      failFrom(
        "createOrder.insertItems",
        itemsErr,
        "We couldn't place your order. Please try again in a moment.",
      );
    }

    // Attach any optional photos (Ask MyTown / medicine prescriptions) to their
    // matching item — insert() preserves input order, so index-align with data.items.
    const attachmentRows = data.items
      .map((item, idx) =>
        item.attachmentPath && insertedItems?.[idx]
          ? {
              order_item_id: insertedItems[idx].id,
              file_path: item.attachmentPath,
              file_type: "image",
            }
          : null,
      )
      .filter(
        (r): r is { order_item_id: string; file_path: string; file_type: string } => r !== null,
      );
    if (attachmentRows.length) {
      const { error: attachErr } = await supabaseAdmin
        .from("order_attachments")
        .insert(attachmentRows);
      // Deliberately non-fatal: the order itself is already valid and visible
      // to staff. Failing the whole request here would tell the customer their
      // order didn't go through when it did -- and a retry would then create a
      // duplicate. Log it and carry on; staff can ask for the photo again.
      if (attachErr)
        console.error(`[createOrder.attachments] ${attachErr.code} ${attachErr.message}`);
    }

    // Resolve/create delivery batch and attach — uses batchWindow so ASAP orders are
    // included too (bug #5 fix), and zonedTimeToUtcISO so scheduled_at is correct in
    // the location's own timezone rather than the server's (bug #4 fix).
    if (batchWindow) {
      const win = windows.find((w) => w.label === batchWindow)!;
      const scheduledAt = zonedTimeToUtcISO(requestedDate, win.start, locTz);
      const { data: batch, error: bErr } = await supabaseAdmin
        .from("delivery_batches")
        .upsert(
          {
            location_id: locationId,
            window_label: batchWindow,
            scheduled_date: requestedDate,
            scheduled_at: scheduledAt,
            status: "open",
          },
          { onConflict: "location_id,window_label,scheduled_date", ignoreDuplicates: false },
        )
        .select("id")
        .single();
      if (!bErr && batch) {
        await supabaseAdmin
          .from("orders")
          .update({ delivery_batch_id: batch.id })
          .eq("id", orderId);
      }
    }

    return { orderId };
  });

// =============================================================================
// Track order
// =============================================================================
export const trackOrder = createServerFn({ method: "GET" })
  .inputValidator((data: { phone?: string; orderId?: string }) =>
    z
      .object({
        phone: z.string().trim().max(20).optional(),
        orderId: z.string().trim().max(20).optional(),
      })
      .refine((v) => v.phone || v.orderId, { message: "Provide phone or order ID" })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const bucket = `track_order:${data.orderId ?? data.phone ?? "unknown"}`;
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("mytown_check_rate_limit", {
      p_bucket: bucket,
      p_max_hits: 20,
      p_window_seconds: 60,
    });
    if (rlErr)
      failFrom(
        "trackOrder.rateLimit",
        rlErr,
        "We couldn't look that up right now. Please try again.",
      );
    if (!allowed) throw userError("Too many lookups. Please wait a moment and try again.");

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, status, notes, created_at, confirmed_at, completed_at, updated_at, requested_date, requested_window, service_fee_estimate, cancelled_at, cancellation_reason, refund_status, customer:customers(id,name,phone,address,landmark), items:order_items(id,item_name,category,subcategory,quantity,notes,is_freeform,unit_price)",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (data.orderId) {
      query = query.eq("id", data.orderId.toUpperCase());
    }
    if (data.phone) {
      const phone = normalizeIndianPhone(data.phone);
      const { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (!cust) return { orders: [] };
      query = query.eq("customer_id", cust.id);
    }
    const { data: rows, error } = await query;
    if (error) failFrom("trackOrder", error, "We couldn't load this order. Please try again.");
    return { orders: rows ?? [] };
  });

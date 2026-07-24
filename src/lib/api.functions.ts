// All MyTown server functions. Callable from routes/components via useServerFn or directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    .regex(/^[+]?[0-9\s-]{7,15}$/, "Enter a valid phone number"),
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
export const getLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, name, slug, default_language, timezone, config")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

// =============================================================================
// Products
// =============================================================================
export const getProducts = createServerFn({ method: "GET" })
  .inputValidator((data: { categorySlug?: string; locationId?: string }) =>
    z
      .object({
        categorySlug: z.string().max(80).optional(),
        locationId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("products")
      .select(
        "id, category_id, name, description, image_url, price, currency, show_price, payment_mode, is_veg, is_service, is_available, schedulable, sort_order, tags",
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
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// =============================================================================
// Categories
// =============================================================================
export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, parent_id, icon_key, sort_order")
    .is("parent_id", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getSubcategories = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parent, error: pErr } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, icon_key")
      .eq("slug", data.slug)
      .is("parent_id", null)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) return { parent: null, items: [] };

    const { data: items, error: cErr } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, icon_key, sort_order")
      .eq("parent_id", parent.id)
      .order("sort_order", { ascending: true });
    if (cErr) throw new Error(cErr.message);
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
      if (error) throw new Error(error.message);
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

    // Log analytics fire-and-forget
    await supabaseAdmin.from("search_analytics").insert({
      term: raw,
      normalized_term: normalize(raw),
      result_count: results.length,
    });

    return { results, term: raw };
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
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      if (locErr) throw new Error(locErr.message);
      if (!loc) throw new Error("No active location configured");
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
      throw new Error("Delivery date must be today, tomorrow, or the day after.");
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
          throw new Error(
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
        if (pErr) throw new Error(pErr.message);
        const blocked = (prods ?? []).find((p) => !p.schedulable);
        if (blocked)
          throw new Error(
            `"${blocked.name}" can't be scheduled ahead. Please choose "Deliver ASAP" or remove it.`,
          );
      }
    }

    // Basic abuse protection: no more than 8 orders per phone number per 10 minutes.
    // There's no reliable client IP in this handler, so phone is the best available
    // identifier; this still meaningfully blocks a script hammering createOrder.
    const rateLimitPhone = data.customer.phone.replace(/\s|-/g, "");
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("mytown_check_rate_limit", {
      p_bucket: `create_order:${rateLimitPhone}`,
      p_max_hits: 8,
      p_window_seconds: 600,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) {
      throw new Error(
        "Too many orders placed recently from this number. Please wait a few minutes and try again.",
      );
    }

    // Upsert customer by phone
    const phone = data.customer.phone.replace(/\s|-/g, "");
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
      if (error) throw new Error(error.message);
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
    if (idErr) throw new Error(idErr.message);
    const orderId = orderIdRow as unknown as string;

    // Insert order (client-facing insert policy forbids delivery_batch_id; write it as a separate update below via service role — but service role bypasses RLS so the initial insert can include location/date fields)
    const { error: orderErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "received",
      notes: data.notes || null,
      location_id: locationId,
      requested_date: requestedDate,
      requested_window: requestedWindow,
    });
    if (orderErr) throw new Error(orderErr.message);

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
        })),
      )
      .select("id");
    if (itemsErr) throw new Error(itemsErr.message);

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
      if (attachErr) throw new Error(attachErr.message);
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

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, status, notes, created_at, confirmed_at, completed_at, updated_at, customer:customers(id,name,phone,address,landmark), items:order_items(id,item_name,category,subcategory,quantity,notes,is_freeform)",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (data.orderId) {
      query = query.eq("id", data.orderId.toUpperCase());
    }
    if (data.phone) {
      const phone = data.phone.replace(/\s|-/g, "");
      const { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (!cust) return { orders: [] };
      query = query.eq("customer_id", cust.id);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

// =============================================================================
// Employee auth + board
// =============================================================================
export const employeeLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string }) =>
    z
      .object({
        pin: z
          .string()
          .trim()
          .regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // pgcrypto crypt(): verify by re-hashing pin with stored salt.
    const { data: match, error } = await supabaseAdmin.rpc("mytown_verify_employee_pin", {
      p_pin: data.pin,
    });
    if (error) {
      // fall back: manual crypt via SQL query is not exposed; if rpc missing, we compare in JS-less way.
      throw new Error(error.message);
    }
    const row = match as unknown as { id: string; name: string } | null;
    if (!row) return { ok: false as const };
    const { setEmployeeCookie } = await import("./employee-session.server");
    setEmployeeCookie(row.id, row.name);
    return { ok: true as const, name: row.name };
  });

export const employeeLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearEmployeeCookie } = await import("./employee-session.server");
  clearEmployeeCookie();
  return { ok: true as const };
});

export const employeeSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readEmployeeSession } = await import("./employee-session.server");
  const s = readEmployeeSession();
  return s ? { signedIn: true as const, name: s.name, id: s.sub } : { signedIn: false as const };
});

export const listEmployeeOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { readEmployeeSession } = await import("./employee-session.server");
  const s = readEmployeeSession();
  if (!s) throw new Error("Unauthorized");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, notes, created_at, updated_at, customer:customers(name,phone,address,landmark), items:order_items(item_name,quantity,notes,is_freeform)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { orders: data ?? [] };
});

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { orderId: string; status: z.infer<typeof OrderStatus> }) =>
    z.object({ orderId: z.string().min(3).max(20), status: OrderStatus }).parse(data),
  )
  .handler(async ({ data }) => {
    const { readEmployeeSession } = await import("./employee-session.server");
    const s = readEmployeeSession();
    if (!s) throw new Error("Unauthorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: data.status,
        updated_at: now,
        assigned_employee_id: s.sub,
        confirmed_at: data.status === "confirmed" ? now : undefined,
        completed_at: data.status === "completed" ? now : undefined,
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

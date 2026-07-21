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

// YYYY-MM-DD, used for the "schedule up to 2 days ahead" feature
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

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
// Locations
// =============================================================================
export const getLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, name, slug, default_language, config")
    .eq("active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// =============================================================================
// Products (real catalog — configurable price/payment/service/schedulable flags)
// =============================================================================
export const getProducts = createServerFn({ method: "GET" })
  .inputValidator((data: { categoryId: string; locationId?: string }) =>
    z
      .object({ categoryId: z.string().uuid(), locationId: z.string().uuid().optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("products")
      .select(
        "id, name, description, image_url, price, currency, show_price, payment_mode, is_veg, is_service, schedulable, sort_order, location_id",
      )
      .eq("category_id", data.categoryId)
      .eq("is_available", true)
      .order("sort_order", { ascending: true });
    if (data.locationId) {
      // A product scoped to a specific location, or unscoped (available everywhere)
      query = query.or(`location_id.eq.${data.locationId},location_id.is.null`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
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
// Create order
// =============================================================================
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
          // Omit both = "Deliver ASAP" path, exactly today's behavior.
          requestedDate: DateOnly.optional(),
          requestedWindow: z.string().trim().max(40).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // upsert-like: find existing by phone or create new
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
      // refresh address/landmark to latest
      await supabaseAdmin
        .from("customers")
        .update({
          name: data.customer.name,
          address: data.customer.address,
          landmark: data.customer.landmark || null,
        })
        .eq("id", customerId);
    }

    // ----- resolve location (defaults to the single active location if not given) -----
    let locationId = data.locationId ?? null;
    if (!locationId) {
      const { data: loc } = await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      locationId = loc?.id ?? null;
    }

    // ----- resolve + validate the requested date/window (schedule-ahead feature) -----
    const todayStr = new Date().toISOString().slice(0, 10);
    const requestedDate = data.requestedDate ?? todayStr;

    if (requestedDate < todayStr) {
      throw new Error("Cannot schedule an order in the past.");
    }
    const maxAheadDate = new Date();
    maxAheadDate.setDate(maxAheadDate.getDate() + 2);
    if (requestedDate > maxAheadDate.toISOString().slice(0, 10)) {
      throw new Error("Orders can only be scheduled up to 2 days ahead.");
    }

    let requestedWindow = data.requestedWindow ?? null;
    let batchId: string | null = null;

    if (locationId) {
      const { data: locRow } = await supabaseAdmin
        .from("locations")
        .select("config")
        .eq("id", locationId)
        .maybeSingle();
      const windows =
        (locRow?.config as { delivery_windows?: Array<{ label: string; cutoff?: string }> } | null)
          ?.delivery_windows ?? [];

      // If the client didn't specify a window (ASAP path), pick the next non-cutoff window.
      if (!requestedWindow && windows.length) {
        const nowTime = new Date().toTimeString().slice(0, 5);
        const next = windows.find(
          (w) => !w.cutoff || requestedDate > todayStr || nowTime < w.cutoff,
        );
        requestedWindow = next?.label ?? windows[0].label;
      }

      // Re-validate the cutoff server-side for a "today" request — never trust client state alone.
      if (requestedWindow && requestedDate === todayStr) {
        const win = windows.find((w) => w.label === requestedWindow);
        const nowTime = new Date().toTimeString().slice(0, 5);
        if (win?.cutoff && nowTime >= win.cutoff) {
          throw new Error(
            `The ${requestedWindow} window for today has already closed. Please pick another window.`,
          );
        }
      }

      // Reject scheduling ahead for any non-schedulable product.
      if (requestedDate > todayStr) {
        const productIds = data.items.map((i) => i.productId).filter(Boolean) as string[];
        if (productIds.length) {
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id, schedulable")
            .in("id", productIds);
          const blocked = prods?.find((p) => p.schedulable === false);
          if (blocked) {
            throw new Error(
              "One of the items in your ask can't be scheduled ahead — please order it for today instead.",
            );
          }
        }
      }

      if (requestedWindow) {
        const { data: batchIdRow, error: batchErr } = await supabaseAdmin.rpc(
          "mytown_get_or_create_batch",
          {
            p_location_id: locationId,
            p_window_label: requestedWindow,
            p_batch_date: requestedDate,
          },
        );
        if (batchErr) throw new Error(batchErr.message);
        batchId = batchIdRow as unknown as string;
      }
    }

    const { data: orderIdRow, error: idErr } = await supabaseAdmin.rpc("mytown_new_order_id");
    if (idErr) throw new Error(idErr.message);
    const orderId = orderIdRow as unknown as string;

    const { error: orderErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "received",
      notes: data.notes || null,
      location_id: locationId,
      delivery_batch_id: batchId,
      requested_date: requestedDate,
      requested_window: requestedWindow,
    });
    if (orderErr) throw new Error(orderErr.message);

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

    // Attach any optional photos (Ask MyTown / medicine prescriptions) to their matching item.
    const attachmentRows = data.items
      .map((i, idx) =>
        i.attachmentPath
          ? {
              order_item_id: insertedItems?.[idx]?.id,
              file_path: i.attachmentPath,
              file_type: "image",
            }
          : null,
      )
      .filter(Boolean) as Array<{ order_item_id: string; file_path: string; file_type: string }>;
    if (attachmentRows.length) {
      const { error: attachErr } = await supabaseAdmin
        .from("order_attachments")
        .insert(attachmentRows);
      if (attachErr) throw new Error(attachErr.message);
    }

    return { orderId, requestedDate, requestedWindow };
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
        "id, status, notes, created_at, confirmed_at, completed_at, updated_at, requested_date, requested_window, customer:customers(id,name,phone,address,landmark), items:order_items(id,item_name,category,subcategory,quantity,notes,is_freeform)",
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

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
  itemName: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional(),
  subcategory: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(280).optional(),
  isFreeform: z.boolean(),
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
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
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
  .inputValidator((data: {
    customer: z.infer<typeof CustomerSchema>;
    items: z.infer<typeof OrderItemSchema>[];
    notes?: string;
  }) =>
    z
      .object({
        customer: CustomerSchema,
        items: z.array(OrderItemSchema).min(1, "Add at least one item"),
        notes: z.string().trim().max(500).optional(),
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

    const { data: orderIdRow, error: idErr } = await supabaseAdmin.rpc("mytown_new_order_id");
    if (idErr) throw new Error(idErr.message);
    const orderId = orderIdRow as unknown as string;

    const { error: orderErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      status: "received",
      notes: data.notes || null,
    });
    if (orderErr) throw new Error(orderErr.message);

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(
      data.items.map((i) => ({
        order_id: orderId,
        item_name: i.itemName,
        category: i.category || null,
        subcategory: i.subcategory || null,
        quantity: i.quantity,
        notes: i.notes || null,
        is_freeform: i.isFreeform,
      })),
    );
    if (itemsErr) throw new Error(itemsErr.message);

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
    z.object({ pin: z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4-8 digits") }).parse(data),
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

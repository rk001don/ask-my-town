// Authenticated server functions for signed-in customers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Get the signed-in user's linked customer profile (if any).
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customers")
      .select("id, name, phone, address, landmark")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

// List the signed-in user's orders (RLS enforces ownership via customers.user_id).
export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, notes, created_at, confirmed_at, completed_at, updated_at, requested_date, requested_window, items:order_items(id,item_name,category,quantity,notes,is_freeform)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Link the customer row behind a just-created order to the signed-in user (idempotent).
// SECURITY: does NOT accept a bare phone number from the client — that would let any
// signed-in account claim any unclaimed phone's order history just by guessing/knowing
// the number. Instead it requires the orderId that was just returned by createOrder in
// this same session, and verifies server-side (a) that order exists, (b) it was created
// recently, and (c) its linked customer isn't already claimed by someone else.
export const linkCustomerToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) =>
    z.object({ orderId: z.string().trim().min(3).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Order not found");

    const createdAtMs = new Date(order.created_at).getTime();
    if (Date.now() - createdAtMs > 30 * 60 * 1000) {
      throw new Error("This order is too old to link automatically.");
    }

    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (custErr) throw new Error(custErr.message);
    if (!customer) throw new Error("Customer record not found");

    // Already linked to someone else — never overwrite.
    if (customer.user_id && customer.user_id !== context.userId) {
      throw new Error("This order belongs to a different account.");
    }
    if (customer.user_id === context.userId) {
      return { ok: true as const }; // already linked to this same user, nothing to do
    }

    const { error } = await supabaseAdmin
      .from("customers")
      .update({ user_id: context.userId })
      .eq("id", customer.id)
      .is("user_id", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Check whether the signed-in user has any staff role.
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role);
    return {
      roles,
      isStaff: roles.some((r) => r === "admin" || r === "ops" || r === "warden_viewer"),
      isAdmin: roles.includes("admin"),
    };
  });

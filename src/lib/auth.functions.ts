// Authenticated server functions for signed-in customers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidIndianPhone, normalizeIndianPhone } from "@/lib/phone";

// A phone number's PIN "account" is really just a normal Supabase Auth user
// with a synthetic email and the PIN as its password -- this deliberately
// reuses Supabase's own tested password hashing, session issuance, and
// brute-force/rate-limit protections on sign-in, rather than hand-rolling a
// custom PIN-verification + session-minting mechanism ourselves. A 6-digit
// PIN (not 4) is required specifically to satisfy Supabase Auth's own
// minimum password length, so no special-casing is needed anywhere else.
function syntheticEmailForPhone(phone: string): string {
  return `${phone}@customers.mytown.internal`;
}

const PinSignupSchema = z.object({
  phone: z.string().trim(),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
  name: z.string().trim().min(2, "Enter your name").max(80),
});

export const signUpWithPin = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof PinSignupSchema>) => PinSignupSchema.parse(data))
  .handler(async ({ data }) => {
    if (!isValidIndianPhone(data.phone)) throw new Error("Enter a valid 10-digit mobile number");
    const phone = normalizeIndianPhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Same abuse protection as order creation -- prevents scripted mass
    // account creation against this endpoint.
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("mytown_check_rate_limit", {
      p_bucket: `pin_signup:${phone}`,
      p_max_hits: 5,
      p_window_seconds: 3600,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (!allowed) throw new Error("Too many attempts. Please try again in a while.");

    const email = syntheticEmailForPhone(phone);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.pin,
      email_confirm: true,
      user_metadata: { phone, auth_method: "pin" },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new Error(
          "This phone number already has an account. Try signing in with your PIN instead.",
        );
      }
      throw new Error(error.message);
    }

    // Link (or create) the customers row for this phone to the new account,
    // same as the email/Google linking path -- so past guest orders under
    // this phone become visible once they sign in.
    const { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (existingCustomer && !existingCustomer.user_id) {
      await supabaseAdmin
        .from("customers")
        .update({ user_id: created.user!.id })
        .eq("id", existingCustomer.id)
        .is("user_id", null);
    } else if (!existingCustomer) {
      await supabaseAdmin.from("customers").insert({
        name: data.name,
        phone,
        address: "",
        user_id: created.user!.id,
      });
    }

    return { email }; // client immediately calls signInWithPassword with this + the PIN
  });

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
        "id, status, notes, created_at, confirmed_at, completed_at, updated_at, requested_date, requested_window, service_fee_estimate, cancelled_at, cancellation_reason, refund_status, items:order_items(id,item_name,category,quantity,notes,is_freeform,unit_price)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; reason?: string }) =>
    z.object({ orderId: z.string().trim().min(3).max(20), reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, status, service_fee_estimate")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Order not found");

    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (customerErr) throw new Error(customerErr.message);
    if (!customer || customer.user_id !== context.userId) {
      throw new Error("You can only cancel your own order.");
    }
    if (order.status !== "received") {
      throw new Error("Only newly received orders can be cancelled by the customer.");
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: context.userId,
        cancelled_by_role: "customer",
        cancellation_reason: data.reason ?? "Customer cancelled order.",
        refund_status: "not_applicable",
        updated_at: now,
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "order.cancel",
      entity_type: "order",
      entity_id: data.orderId,
      metadata: { reason: data.reason ?? "Customer cancelled order.", status: "cancelled" },
    });

    return { ok: true as const };
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

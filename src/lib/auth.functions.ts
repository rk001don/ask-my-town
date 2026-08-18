// Authenticated server functions for signed-in customers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failFrom, userError } from "@/lib/errors";
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
    if (!isValidIndianPhone(data.phone)) throw userError("Enter a valid 10-digit mobile number");
    const phone = normalizeIndianPhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Same abuse protection as order creation -- prevents scripted mass
    // account creation against this endpoint.
    const { data: allowed, error: rlErr } = await supabaseAdmin.rpc("mytown_check_rate_limit", {
      p_bucket: `pin_signup:${phone}`,
      p_max_hits: 5,
      p_window_seconds: 3600,
    });
    if (rlErr) failFrom("auth:38", rlErr, "We couldn't complete sign-up. Please try again.");
    if (!allowed) throw userError("Too many attempts. Please try again in a while.");

    const email = syntheticEmailForPhone(phone);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.pin,
      email_confirm: true,
      user_metadata: { phone, auth_method: "pin" },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw userError(
          "This phone number already has an account. Try signing in with your PIN instead.",
        );
      }
      failFrom("auth:54", error, "We couldn't create your account. Please try again.");
    }

    // Give the new account its own customer record.
    //
    // This used to claim whatever guest record matched the phone number, which
    // is unsafe now that guest records are shared by number: a second person
    // signing up with a number someone else had used at checkout would inherit
    // that person's address and orders. Past guest orders are instead claimed
    // one at a time from the account screen, using the order ID as proof.
    //
    // Address is seeded from the most recent guest order on this number purely
    // as a convenience -- it is the address this person is about to type
    // anyway, and it is theirs to correct.
    const { data: recentGuest } = await supabaseAdmin
      .from("customers")
      .select("address, landmark, pincode")
      .eq("phone", phone)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const { error: custErr } = await supabaseAdmin.from("customers").insert({
      name: data.name,
      phone,
      address: recentGuest?.[0]?.address ?? "",
      landmark: recentGuest?.[0]?.landmark ?? null,
      pincode: recentGuest?.[0]?.pincode ?? null,
      user_id: created.user!.id,
    });
    if (custErr)
      failFrom(
        "auth:signUpWithPin.customer",
        custErr,
        "We couldn't finish signing you up. Please try again.",
      );

    return { email }; // client immediately calls signInWithPassword with this + the PIN
  });

// Get the signed-in user's linked customer profile (if any).
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customers")
      .select("id, name, phone, address, landmark, pincode")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) failFrom("auth:96", error, "We couldn't load your profile. Please try again.");
    return data;
  });

/**
 * Update the signed-in user's own name and address.
 *
 * Needed on its own terms -- people move house, and names were previously only
 * settable by placing an order -- but also as the repair path for accounts
 * whose profile was overwritten by someone else's checkout before identity was
 * separated from phone number.
 *
 * Scoped by user_id on the write, so this can only ever touch the caller's own
 * record.
 */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      name: string;
      phone?: string;
      address?: string;
      landmark?: string;
      pincode?: string;
    }) =>
      z
        .object({
          name: z.string().trim().min(2, "Enter your name").max(80),
          phone: z.string().trim().max(20).optional(),
          address: z.string().trim().max(300).optional(),
          landmark: z.string().trim().max(160).optional(),
          pincode: z
            .string()
            .trim()
            .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode, or leave it blank.")
            .optional()
            .or(z.literal("").transform(() => undefined)),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.phone && !isValidIndianPhone(data.phone)) {
      throw userError("Enter a valid 10-digit mobile number");
    }
    const patch: {
      name: string;
      phone?: string;
      address?: string;
      landmark?: string | null;
      pincode?: string | null;
    } = { name: data.name };
    if (data.phone) patch.phone = normalizeIndianPhone(data.phone);
    if (data.address !== undefined) patch.address = data.address;
    if (data.landmark !== undefined) patch.landmark = data.landmark || null;
    if (data.pincode !== undefined) patch.pincode = data.pincode || null;

    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("customers")
        .update(patch)
        .eq("user_id", context.userId);
      if (error) failFrom("auth:updateMyProfile", error, "We couldn't save your details.");
    } else {
      const { error } = await supabaseAdmin.from("customers").insert({
        user_id: context.userId,
        name: data.name,
        phone: patch.phone ?? "",
        address: patch.address ?? "",
        landmark: patch.landmark ?? null,
        pincode: patch.pincode ?? null,
      });
      if (error) failFrom("auth:updateMyProfile.insert", error, "We couldn't save your details.");
    }
    return { ok: true as const };
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
    if (error) failFrom("auth:111", error, "We couldn't load your orders. Pull down to refresh.");
    return data ?? [];
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; reason?: string }) =>
    z
      .object({
        orderId: z.string().trim().min(3).max(20),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, status, service_fee_estimate")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) failFrom("auth:132", orderErr, "We couldn't load that order. Please try again.");
    if (!order) throw userError("We couldn't find that order.");

    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (customerErr)
      failFrom("auth:140", customerErr, "We couldn't verify your account. Please try again.");
    if (!customer || customer.user_id !== context.userId) {
      throw userError("That order isn't linked to your account, so we can't cancel it here.");
    }
    if (order.status !== "received") {
      throw userError(
        "This order's already being prepared, so it can't be cancelled here. Contact us if you need changes.",
      );
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
    if (error) failFrom("auth:161", error, "We couldn't cancel the order. Please try again.");

    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "order.cancel",
      entity_type: "order",
      entity_id: data.orderId,
      metadata: { reason: data.reason ?? "Customer cancelled order.", status: "cancelled" },
    });

    return { ok: true as const };
  });

/**
 * Move one guest order onto the signed-in user's account.
 *
 * SECURITY: does not accept a phone number. A number is not a secret, so
 * accepting one would let any account claim any stranger's order history by
 * knowing or guessing it. The order ID is the credential -- it is random,
 * issued at checkout, and known only to the person who placed the order.
 *
 * This re-points the ORDER, where it used to stamp the signed-in user onto the
 * order's customer row. That was unsafe once guest records are shared by phone
 * number: claiming the record handed over every other guest order sitting on
 * it too. Moving the single order claims exactly what the order ID proves.
 * Its delivery details travel with it, because the order snapshots them.
 */
export const linkCustomerToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) =>
    z
      .object({
        orderId: z
          .string()
          .trim()
          .min(3, "Enter the order ID from your confirmation, e.g. MT-4821.")
          .max(20, "That doesn't look like an order ID."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderId = data.orderId.toUpperCase();
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, contact_name, contact_phone, delivery_address, delivery_landmark")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) failFrom("auth:193", orderErr, "We couldn't load that order. Please try again.");
    if (!order) throw userError("We couldn't find an order with that ID. Check it and try again.");

    const { data: currentOwner, error: custErr } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (custErr)
      failFrom("auth:206", custErr, "We couldn't verify your account. Please try again.");

    if (currentOwner?.user_id === context.userId) {
      return { ok: true as const }; // already on this account
    }
    // Belongs to a real account that isn't the caller's -- never move it.
    if (currentOwner?.user_id) {
      throw userError("That order is already saved to a different account.");
    }

    // The caller's own customer record, created on demand. Seeded from the
    // order's contact snapshot so a customer who signs up right after
    // checking out doesn't have to retype their address.
    const { data: mine } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    let myCustomerId = mine?.id;
    if (!myCustomerId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("customers")
        .insert({
          user_id: context.userId,
          name: order.contact_name ?? "",
          phone: order.contact_phone ?? "",
          address: order.delivery_address ?? "",
          landmark: order.delivery_landmark,
        })
        .select("id")
        .single();
      if (insErr)
        failFrom(
          "auth:linkCustomer.insert",
          insErr,
          "We couldn't link this order to your account.",
        );
      myCustomerId = inserted!.id;
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ customer_id: myCustomerId })
      .eq("id", orderId)
      // Re-checks ownership at write time, so a concurrent claim can't be
      // overtaken between the read above and this update.
      .eq("customer_id", order.customer_id);
    if (error) failFrom("auth:222", error, "We couldn't link this order to your account.");
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
    if (error) failFrom("auth:234", error, "We couldn't save your details. Please try again.");
    const roles = (data ?? []).map((r) => r.role);
    return {
      roles,
      isStaff: roles.some((r) => r === "admin" || r === "ops" || r === "warden_viewer"),
      isAdmin: roles.includes("admin"),
    };
  });

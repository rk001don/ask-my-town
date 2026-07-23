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

// Link the customer row for the given phone to the signed-in user (idempotent).
// Called from the client right after a successful checkout so future signed-in
// visits see the order under "My orders".
export const linkCustomerToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) =>
    z.object({ phone: z.string().trim().min(7).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const phone = data.phone.replace(/\s|-/g, "");
    // Only claim if unclaimed OR already owned by this user — never steal.
    const { error } = await supabaseAdmin
      .from("customers")
      .update({ user_id: context.userId })
      .eq("phone", phone)
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

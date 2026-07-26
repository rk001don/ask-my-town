// Staff-only server functions. Auth = Supabase Auth + user_roles check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OrderStatus = z.enum([
  "received",
  "confirmed",
  "arranging",
  "on_the_way",
  "completed",
  "cancelled",
]);

async function assertStaff(
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  },
  userId: string,
  requireOps = false,
) {
  // Query user_roles directly (RLS allows own-row read); avoids relying on has_role RPC grants.
  const { data, error } = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => Promise<{ data: { role: string }[] | null; error: unknown }>;
        };
      };
    }
  )
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Failed to verify staff role");
  const roles = (data ?? []).map((r) => r.role);
  const staff = roles.some((r) => r === "admin" || r === "ops" || r === "warden_viewer");
  if (!staff) throw new Error("Forbidden: staff role required");
  if (requireOps && !roles.some((r) => r === "admin" || r === "ops")) {
    throw new Error("Forbidden: admin or ops required");
  }
  return roles;
}

export const listStaffOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertStaff(context.supabase as never, context.userId);
    const isAdminOrOps = roles.some((r) => r === "admin" || r === "ops");

    if (!isAdminOrOps) {
      // warden_viewer (or any non-admin/ops staff role): aggregate counts only.
      // The RPC is no longer executable by the authenticated role directly (to
      // avoid exposing a SECURITY DEFINER surface to any signed-in user); we
      // invoke it via the admin client after verifying the staff role above.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("mytown_warden_daily_counts", {});
      if (error) throw new Error(error.message);
      return { aggregateOnly: true as const, dailyCounts: data ?? [] };
    }

    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, notes, created_at, updated_at, requested_date, requested_window, customer:customers(name,phone,address,landmark), items:order_items(item_name,quantity,notes,is_freeform,unit_price,attachments:order_attachments(id,file_path,file_type))",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { aggregateOnly: false as const, orders: data ?? [] };
  });

// The ask-attachments bucket is private -- a raw file_path can't be shown in
// an <img> tag directly, it needs a short-lived signed URL. Staff-only.
export const getAttachmentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filePath: string }) =>
    z.object({ filePath: z.string().trim().min(1).max(400) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("ask-attachments")
      .createSignedUrl(data.filePath, 300); // 5 minutes -- just long enough to view, not a durable link
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const updateStaffOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; status: z.infer<typeof OrderStatus> }) =>
    z.object({ orderId: z.string().min(3).max(20), status: OrderStatus }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId, true);
    const now = new Date().toISOString();
    const patch: {
      status: typeof data.status;
      updated_at: string;
      confirmed_at?: string;
      completed_at?: string;
    } = { status: data.status, updated_at: now };
    if (data.status === "confirmed") patch.confirmed_at = now;
    if (data.status === "completed") patch.completed_at = now;
    const { error } = await context.supabase.from("orders").update(patch).eq("id", data.orderId);
    if (error) throw new Error(error.message);
    // Fire-and-forget audit
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "order.status_update",
      entity_type: "order",
      entity_id: data.orderId,
      metadata: { status: data.status },
    });
    return { ok: true as const };
  });

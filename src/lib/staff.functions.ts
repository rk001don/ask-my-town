// Staff-only server functions. Auth = Supabase Auth + user_roles check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STATUS_COPY, type OrderStatus as OrderStatusType } from "@/lib/constants";

const OrderStatus = z.enum([
  "received",
  "confirmed",
  "arranging",
  "on_the_way",
  "completed",
  "cancelled",
]);

const ORDER_NEXT_STATUS: Record<string, string> = {
  received: "confirmed",
  confirmed: "arranging",
  arranging: "on_the_way",
  on_the_way: "completed",
};

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
        "id, status, notes, created_at, updated_at, requested_date, requested_window, service_fee_estimate, service_fee_final, cancellation_reason, customer:customers(name,phone,address,landmark), items:order_items(item_name,quantity,notes,is_freeform,unit_price,attachments:order_attachments(id,file_path,file_type))",
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

    if (data.status !== "cancelled") {
      const { data: current, error: fetchErr } = await context.supabase
        .from("orders")
        .select("status")
        .eq("id", data.orderId)
        .maybeSingle();
      if (fetchErr) throw new Error(fetchErr.message);
      if (!current) throw new Error("Order not found");
      const expected = ORDER_NEXT_STATUS[current.status];
      if (expected !== data.status) {
        throw new Error(
          `Cannot move from "${current.status}" to "${data.status}". Next valid status is "${expected ?? "none"}".`,
        );
      }
    }

    const now = new Date().toISOString();
    const patch: {
      status: typeof data.status;
      updated_at: string;
      confirmed_at?: string;
      completed_at?: string;
      cancelled_at?: string;
      cancelled_by?: string;
      cancelled_by_role?: string;
      cancellation_reason?: string;
    } = { status: data.status, updated_at: now };
    if (data.status === "confirmed") patch.confirmed_at = now;
    if (data.status === "completed") patch.completed_at = now;
    if (data.status === "cancelled") {
      patch.cancelled_at = now;
      patch.cancelled_by = context.userId;
      patch.cancelled_by_role = "staff";
      patch.cancellation_reason = "Cancelled by staff.";
    }
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
    // Best-effort push notification -- never throws into the caller, a
    // notification failing must not make the status update itself fail.
    try {
      const { sendPushForOrder } = await import("@/lib/push.server");
      const copy = STATUS_COPY[data.status as OrderStatusType];
      await sendPushForOrder(data.orderId, {
        title: "MyTown order update",
        body: copy?.blurb ?? `Your order is now ${data.status}.`,
        url: `/order/${data.orderId}`,
      });
    } catch {
      /* notifications are best-effort, see comment above */
    }
    return { ok: true as const };
  });

export const cancelStaffOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; reason: string }) =>
    z
      .object({
        orderId: z.string().trim().min(3).max(20),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Order not found");

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: context.userId,
        cancelled_by_role: "staff",
        cancellation_reason: data.reason,
        updated_at: now,
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      staff_id: context.userId,
      action: "order.cancel",
      entity_type: "order",
      entity_id: data.orderId,
      metadata: { reason: data.reason, status: "cancelled" },
    });

    return { ok: true as const };
  });

// ============================================================================
// Delivery batch self-claim -- lets any ops/admin staff claim an unassigned
// trip as themselves, without needing an admin to hand-assign one.
// ============================================================================

export const listMyDeliveryBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase as never, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: batches, error } = await supabaseAdmin
      .from("delivery_batches")
      .select(
        "id, window_label, scheduled_date, scheduled_at, status, assigned_staff_id, assigned_staff_email",
      )
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    if (!batches || batches.length === 0) return [];

    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from("orders")
      .select("delivery_batch_id, status")
      .in(
        "delivery_batch_id",
        batches.map((b) => b.id),
      );
    if (ordersErr) throw new Error(ordersErr.message);

    return batches.map((b) => {
      const rows = (orders ?? []).filter((o) => o.delivery_batch_id === b.id);
      return {
        ...b,
        orderCount: rows.length,
        pendingCount: rows.filter((o) => o.status !== "completed" && o.status !== "cancelled")
          .length,
      };
    });
  });

export const claimDeliveryBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;

    // Atomic claim: the WHERE clause is what stops two riders tapping
    // "Claim" on the same trip at nearly the same moment from both winning.
    const { data: claimed, error } = await supabaseAdmin
      .from("delivery_batches")
      .update({
        assigned_staff_id: context.userId,
        assigned_staff_email: email,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .is("assigned_staff_id", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed) throw new Error("Someone already claimed this trip.");
    return { ok: true as const };
  });

export const releaseDeliveryBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase as never, context.userId, true);
    const isAdmin = roles.some((r) => r === "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("delivery_batches")
      .update({ assigned_staff_id: null, assigned_staff_email: null, assigned_at: null })
      .eq("id", data.id);
    // Admin can free up anyone's claim (e.g. a rider's phone died); a
    // regular ops staffer can only release their own.
    if (!isAdmin) query = query.eq("assigned_staff_id", context.userId);

    const { data: released, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!released) throw new Error("This trip isn't assigned to you.");
    return { ok: true as const };
  });

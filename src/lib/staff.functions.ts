// Staff-only server functions. Auth = Supabase Auth + user_roles check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failFrom, userError } from "@/lib/errors";
import {
  STATUS_COPY,
  STATUS_PUSH_TITLE,
  type OrderStatus as OrderStatusType,
} from "@/lib/constants";

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
  if (error) throw userError("Couldn't confirm your staff access. Please try again.");
  const roles = (data ?? []).map((r) => r.role);
  const staff = roles.some((r) => r === "admin" || r === "ops" || r === "warden_viewer");
  if (!staff) throw userError("You need staff access for this.");
  if (requireOps && !roles.some((r) => r === "admin" || r === "ops")) {
    throw userError("You need admin or ops access for this.");
  }
  return roles;
}

/**
 * Display names for staff, cached in memory.
 *
 * The staff board polls, and each refresh was pulling the full user directory
 * (up to 200 records) purely to resolve two or three "Claimed by" names. Staff
 * names change on the order of never, so re-fetching them every few seconds is
 * pure waste -- on the mobile data this board is actually used on, it's the
 * most expensive thing the page does.
 *
 * A module-level cache lives as long as the warm serverless instance does; a
 * cold start simply refetches. Five minutes is well inside "a new staffer
 * appears in the list promptly" while removing essentially all of the traffic.
 */
const STAFF_NAME_TTL_MS = 5 * 60_000;
let staffNameCache: { at: number; names: Record<string, string> } | null = null;

async function getStaffDisplayNames(): Promise<Record<string, string>> {
  if (staffNameCache && Date.now() - staffNameCache.at < STAFF_NAME_TTL_MS) {
    return staffNameCache.names;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const names = Object.fromEntries(
    (usersData?.users ?? [])
      .map((u) => [u.id, u.user_metadata?.full_name || u.user_metadata?.name])
      .filter(([, name]) => !!name),
  ) as Record<string, string>;
  staffNameCache = { at: Date.now(), names };
  return names;
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
      if (error) failFrom("staff:73", error, "Couldn't load the daily summary. Please retry.");
      return { aggregateOnly: true as const, dailyCounts: data ?? [] };
    }

    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, notes, created_at, updated_at, requested_date, requested_window, service_fee_estimate, service_fee_final, cancellation_reason, assigned_staff_id, assigned_staff_email, contact_name, contact_phone, delivery_address, delivery_landmark, delivery_pincode, customer:customers(name,phone,address,landmark), items:order_items(item_name,quantity,notes,is_freeform,unit_price,attachments:order_attachments(id,file_path,file_type))",
      )
      // Oldest first -- whoever's been waiting longest gets served first,
      // same first-come-first-served principle every delivery queue runs on.
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) failFrom("staff:86", error, "Couldn't load orders. Please retry.");
    const orders = data ?? [];

    // Look up real display names for whoever has claimed an order, so "Claimed
    // by" can show a person's name instead of their email's local part. Only
    // Google-signed-in staff carry a name in Auth metadata today (plain
    // email/password and PIN accounts don't collect one); anyone without one
    // falls back to the email-derived name on the client, same as before.
    const assigneeIds = [...new Set(orders.map((o) => o.assigned_staff_id).filter((v) => !!v))];
    const assigneeNames = assigneeIds.length > 0 ? await getStaffDisplayNames() : {};
    const ordersWithNames = orders.map((o) => ({
      ...o,
      assigned_staff_name: o.assigned_staff_id
        ? (assigneeNames[o.assigned_staff_id] ?? null)
        : null,
    }));
    return { aggregateOnly: false as const, orders: ordersWithNames };
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
    if (error) failFrom("staff:131", error, "Couldn't open that attachment. Please retry.");
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
      if (fetchErr)
        failFrom("staff:149", fetchErr, "Couldn't read the order's current status. Please retry.");
      if (!current) throw userError("We couldn't find that order.");
      const expected = ORDER_NEXT_STATUS[current.status];
      if (expected !== data.status) {
        throw userError(
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
    if (error) failFrom("staff:179", error, "Couldn't update the order status. Please retry.");
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
      const status = data.status as OrderStatusType;
      const copy = STATUS_COPY[status];
      await sendPushForOrder(data.orderId, {
        title: STATUS_PUSH_TITLE[status] ?? "Order update",
        // Lead the body with the order id so a customer with more than one
        // live order can tell which is which without opening the app.
        body: `${data.orderId} · ${copy?.blurb ?? `Your order is now ${data.status}.`}`,
        url: `/order/${data.orderId}`,
        // One notification per order: a shared tag makes each status update
        // replace the previous one for that order instead of stacking five
        // separate lines in the tray. renotify (in the SW) still alerts.
        tag: `order-${data.orderId}`,
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
    if (orderErr) failFrom("staff:230", orderErr, "Couldn't load that order. Please retry.");
    if (!order) throw userError("We couldn't find that order.");

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
    if (error) failFrom("staff:245", error, "Couldn't cancel the order. Please retry.");

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
// Order self-assignment -- any ops/admin staff can claim an order as
// themselves directly (no separate "delivery batch" concept to manage).
// ============================================================================

export const assignOrdersToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderIds: string[] }) =>
    z.object({ orderIds: z.array(z.string().trim().min(3).max(20)).min(1).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;

    // Atomic per-order claim: the WHERE clause is what stops two staff
    // tapping "Assign to me" on the same order at nearly the same moment
    // from both winning. Claiming several at once (the "nearby orders"
    // bundle) just runs this same atomic update for each id.
    const { data: claimed, error } = await supabaseAdmin
      .from("orders")
      .update({
        assigned_staff_id: context.userId,
        assigned_staff_email: email,
        assigned_at: new Date().toISOString(),
      })
      .in("id", data.orderIds)
      .is("assigned_staff_id", null)
      .select("id");
    if (error) failFrom("staff:287", error, "Couldn't assign the order. Please retry.");
    return { claimed: (claimed ?? []).map((o) => o.id) };
  });

export const unassignOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) =>
    z.object({ orderId: z.string().trim().min(3).max(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase as never, context.userId, true);
    const isAdmin = roles.some((r) => r === "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("orders")
      .update({ assigned_staff_id: null, assigned_staff_email: null, assigned_at: null })
      .eq("id", data.orderId);
    // Admin can free up anyone's claim (e.g. a rider's phone died); a
    // regular ops staffer can only release their own.
    if (!isAdmin) query = query.eq("assigned_staff_id", context.userId);

    const { data: released, error } = await query.select("id").maybeSingle();
    if (error) failFrom("staff:310", error, "Couldn't release the order. Please retry.");
    if (!released) throw userError("This order isn't assigned to you.");
    return { ok: true as const };
  });

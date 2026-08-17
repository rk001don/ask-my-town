import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failFrom, userError } from "@/lib/errors";

async function assertAdmin(
  supabase: {
    from: (table: string) => {
      select: (column: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: { role: string }[] | null; error: unknown }>;
      };
    };
  },
  userId: string,
) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw userError("Failed to verify admin role");
  if (!(data ?? []).some((r) => r.role === "admin")) {
    throw userError("Forbidden: admin role required");
  }
}

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      type: string;
      title: string;
      body: string;
      image_url?: string | null;
      deep_link?: string | null;
      category?: string | null;
      target?: string;
      scheduled_at?: string | null;
    }) =>
      z
        .object({
          type: z.enum([
            "order_update",
            "delivery_update",
            "offer",
            "new_category",
            "flash_sale",
            "maintenance",
            "service_update",
            "festival",
            "emergency",
          ]),
          title: z.string().trim().min(1).max(120),
          body: z.string().trim().min(1).max(300),
          image_url: z.string().trim().max(600).nullable().optional(),
          deep_link: z.string().trim().max(600).nullable().optional(),
          category: z.string().trim().max(60).nullable().optional(),
          target: z
            .enum(["everyone", "customers", "staff", "admins", "selected_users"])
            .default("everyone"),
          scheduled_at: z.string().datetime().nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("notification_campaigns")
      .insert({
        type: data.type,
        title: data.title,
        body: data.body,
        image_url: data.image_url ?? null,
        deep_link: data.deep_link ?? null,
        category: data.category ?? null,
        target: data.target ?? "everyone",
        scheduled_at: data.scheduled_at ?? null,
        created_by: context.userId,
        status: data.scheduled_at ? "scheduled" : "draft",
      })
      .select("id")
      .single();
    if (error) failFrom("notifications-admin", error, "That didn't work. Please try again.");
    return { id: inserted.id };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notification_campaigns")
      .select(
        "id, type, title, body, image_url, deep_link, category, target, status, scheduled_at, sent_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) failFrom("notifications-admin", error, "That didn't work. Please try again.");
    return data ?? [];
  });

// The one valid entry point for actually delivering a campaign. Draft/
// scheduled/failed campaigns can be sent; sending/sent campaigns cannot be
// re-sent from here (the atomic claim below is what enforces that).
const SENDABLE_STATUSES = ["draft", "scheduled", "failed"];

export const sendCampaignNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Atomically claim the campaign by flipping it to "sending" only if it's
    // still in a sendable state -- this is what stops a rapid double-click
    // (or two admins clicking at once) from dispatching the same campaign
    // twice; the second request's UPDATE matches zero rows and is rejected.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("notification_campaigns")
      .update({ status: "sending" })
      .eq("id", data.id)
      .in("status", SENDABLE_STATUSES)
      .select("id, title, body, image_url, deep_link, target")
      .maybeSingle();
    if (claimErr) failFrom("notifications-admin", claimErr, "That didn't work. Please try again.");
    if (!claimed) {
      throw userError("This campaign is already sending or has already been sent.");
    }

    try {
      let deviceQuery = supabaseAdmin
        .from("push_devices")
        .select("id, endpoint, p256dh, auth, user_id");

      if (claimed.target === "staff" || claimed.target === "admins") {
        const roles =
          claimed.target === "admins" ? (["admin"] as const) : (["ops", "warden_viewer"] as const);
        const { data: roleRows, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .in("role", roles);
        if (roleErr)
          failFrom("notifications-admin", roleErr, "That didn't work. Please try again.");
        const userIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
        if (userIds.length === 0) {
          await supabaseAdmin
            .from("notification_campaigns")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", data.id);
          return { ok: true as const, sent: 0, failed: 0 };
        }
        deviceQuery = deviceQuery.in("user_id", userIds);
      } else if (claimed.target === "customers") {
        // "Customers" = every registered device that isn't tied to a staff/admin
        // account. Everyone else (target === "everyone", or an unrecognized
        // value) gets no additional filter.
        const { data: roleRows, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id");
        if (roleErr)
          failFrom("notifications-admin", roleErr, "That didn't work. Please try again.");
        const staffIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
        if (staffIds.length > 0) {
          deviceQuery = deviceQuery.not("user_id", "in", `(${staffIds.join(",")})`);
        }
      }

      const { data: devices, error: devErr } = await deviceQuery;
      if (devErr) failFrom("notifications-admin", devErr, "That didn't work. Please try again.");
      const { sendWebPush } = await import("@/lib/webpush.server");
      const vapid = {
        publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
        privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
        subject: process.env.VAPID_SUBJECT || "mailto:support@example.com",
      };
      if (!vapid.publicKey || !vapid.privateKey) {
        throw userError("Missing VAPID configuration");
      }

      let sent = 0;
      let failed = 0;
      const deliveryRows: {
        campaign_id: string;
        device_id: string;
        status: "sent" | "failed";
        error: string | null;
      }[] = [];
      const deadDeviceIds: string[] = [];

      for (const device of devices ?? []) {
        const result = await sendWebPush(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify({
            title: claimed.title,
            body: claimed.body,
            image: claimed.image_url ?? undefined,
            url: claimed.deep_link ?? "/",
          }),
          vapid,
        );
        if (result.ok) {
          sent += 1;
          deliveryRows.push({
            campaign_id: data.id,
            device_id: device.id,
            status: "sent",
            error: null,
          });
        } else {
          failed += 1;
          deliveryRows.push({
            campaign_id: data.id,
            device_id: device.id,
            status: "failed",
            error: result.message?.slice(0, 300) || `HTTP ${result.statusCode}`,
          });
          if (result.statusCode === 404 || result.statusCode === 410) {
            deadDeviceIds.push(device.id);
          }
        }
      }

      if (deliveryRows.length > 0) {
        await supabaseAdmin.from("notification_deliveries").insert(deliveryRows);
      }
      if (deadDeviceIds.length > 0) {
        await supabaseAdmin.from("push_devices").delete().in("id", deadDeviceIds);
      }

      await supabaseAdmin
        .from("notification_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", data.id);

      return { ok: true as const, sent, failed };
    } catch (err) {
      // Don't leave the campaign stuck in "sending" forever -- let it be retried.
      await supabaseAdmin
        .from("notification_campaigns")
        .update({ status: "failed" })
        .eq("id", data.id);
      throw err;
    }
  });

// Lets the admin see *before* sending whether anyone is actually reachable,
// instead of finding out only after a send comes back with 0 recipients.
export const getNotificationReach = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices, error } = await supabaseAdmin.from("push_devices").select("user_id");
    if (error) failFrom("notifications-admin", error, "That didn't work. Please try again.");
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (roleErr) failFrom("notifications-admin", roleErr, "That didn't work. Please try again.");
    const staffAdminIds = new Set(roleRows?.map((r) => r.user_id) ?? []);
    const adminIds = new Set(
      (roleRows ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
    );
    const staffIds = new Set(
      (roleRows ?? [])
        .filter((r) => r.role === "ops" || r.role === "warden_viewer")
        .map((r) => r.user_id),
    );

    let everyone = 0;
    let customers = 0;
    let staff = 0;
    let admins = 0;
    for (const d of devices ?? []) {
      everyone += 1;
      const uid = d.user_id ?? "";
      if (!staffAdminIds.has(uid)) customers += 1;
      if (staffIds.has(uid)) staff += 1;
      if (adminIds.has(uid)) admins += 1;
    }
    return { everyone, customers, staff, admins };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; body: string; deep_link?: string | null }) =>
    z
      .object({
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(300),
        deep_link: z.string().trim().max(600).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: devices } = await supabaseAdmin
      .from("push_devices")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", context.userId)
      .limit(10);
    if (!devices || devices.length === 0) return { ok: true as const, sent: 0 };
    const { sendWebPush } = await import("@/lib/webpush.server");
    const vapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
      privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
      subject: process.env.VAPID_SUBJECT || "mailto:support@example.com",
    };
    if (!vapid.publicKey || !vapid.privateKey) {
      throw userError("Missing VAPID configuration");
    }
    let sent = 0;
    for (const device of devices) {
      const result = await sendWebPush(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ title: data.title, body: data.body, url: data.deep_link ?? "/" }),
        vapid,
      );
      if (result.ok) sent += 1;
    }
    return { ok: true as const, sent };
  });

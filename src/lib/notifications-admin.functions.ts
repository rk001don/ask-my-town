import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: { from: (table: string) => { select: (column: string) => { eq: (column: string, value: string) => Promise<{ data: { role: string }[] | null; error: unknown }> } } }, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Failed to verify admin role");
  if (!(data ?? []).some((r) => r.role === "admin")) {
    throw new Error("Forbidden: admin role required");
  }
}

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
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
        target: z.enum(["everyone", "customers", "staff", "admins", "selected_users"]).default("everyone"),
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
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notification_campaigns")
      .select("id, type, title, body, image_url, deep_link, category, target, status, scheduled_at, sent_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; body: string; deep_link?: string | null }) =>
    z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(300),
      deep_link: z.string().trim().max(600).nullable().optional(),
    }).parse(data),
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
      throw new Error("Missing VAPID configuration");
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failFrom, userError } from "@/lib/errors";

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; platform?: string }) =>
    z
      .object({
        endpoint: z.string().trim().min(10).max(600),
        p256dh: z.string().trim().min(1).max(300),
        auth: z.string().trim().min(1).max(300),
        platform: z.enum(["web", "android", "ios"]).default("web"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_devices").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        platform: data.platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error)
      failFrom("notifications:30", error, "Couldn't register this device for notifications.");
    return { ok: true as const };
  });

export const unregisterDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) =>
    z.object({ endpoint: z.string().trim().min(10).max(600) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("push_devices")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) failFrom("notifications:46", error, "Couldn't update your notification settings.");
    return { ok: true as const };
  });

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("push_devices")
      .select("id, endpoint, platform, topics, last_seen_at")
      .eq("user_id", context.userId)
      .order("last_seen_at", { ascending: false });
    if (error) failFrom("notifications:59", error, "Couldn't update your notification settings.");
    return { devices: data ?? [] };
  });

export const setNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { topics?: string[] }) =>
    z.object({ topics: z.array(z.string().trim().min(1).max(40)).max(20).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("push_devices")
      .select("id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (existingErr)
      failFrom("notifications:76", existingErr, "Couldn't register this device for notifications.");
    if (!existing) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("push_devices")
      .update({ topics: data.topics ?? [] })
      .eq("id", existing.id);
    if (error)
      failFrom("notifications:83", error, "Couldn't register this device for notifications.");
    return { ok: true as const };
  });

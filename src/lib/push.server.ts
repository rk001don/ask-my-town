// Server-only push sending. Never import this from a route/component file --
// it pulls in the private VAPID key via process.env, same trust boundary as
// client.server.ts's service role key.
import { sendWebPush } from "@/lib/webpush.server";

function getVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY environment variables.");
  }
  return { publicKey, privateKey, subject };
}

/**
 * Sends a push notification to every subscription registered for an order,
 * and prunes any subscription the push service reports as dead (410 Gone /
 * 404) so we're not retrying a browser tab that closed weeks ago.
 */
export async function sendPushForOrder(
  orderId: string,
  payload: { title: string; body: string; url?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("order_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("order_id", orderId);
  if (error || !subs || subs.length === 0) return;

  const vapid = getVapid();
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const result = await sendWebPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          vapid,
        );
        if (!result.ok && (result.statusCode === 404 || result.statusCode === 410)) {
          await supabaseAdmin.from("order_push_subscriptions").delete().eq("id", sub.id);
        }
      } catch {
        // Any other error (network blip, etc.) is not fatal to the status
        // update itself -- notifications are best-effort, not a source of
        // truth the customer depends on exclusively (they can still check
        // the tracking page).
      }
    }),
  );
}

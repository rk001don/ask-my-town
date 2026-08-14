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
 *
 * Two sources are combined so "notify me" only has to be granted once:
 *  - order_push_subscriptions: per-order, used by guests with no account.
 *  - push_devices: account-level, used once a signed-in customer has granted
 *    permission anywhere in the app (also what campaign broadcasts use).
 * Subscriptions are deduped by endpoint so a signed-in customer who also
 * subscribed via the per-order button doesn't get paged twice.
 */
export async function sendPushForOrder(
  orderId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [orderSubsRes, orderRes] = await Promise.all([
    supabaseAdmin
      .from("order_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("order_id", orderId),
    supabaseAdmin.from("orders").select("customer_id").eq("id", orderId).maybeSingle(),
  ]);

  const orderSubs = (orderSubsRes.data ?? []).map((s) => ({ ...s, source: "order" as const }));

  let deviceSubs: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    source: "device";
  }[] = [];
  if (orderRes.data?.customer_id) {
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("user_id")
      .eq("id", orderRes.data.customer_id)
      .maybeSingle();
    if (customer?.user_id) {
      const { data: devices } = await supabaseAdmin
        .from("push_devices")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", customer.user_id);
      deviceSubs = (devices ?? []).map((d) => ({ ...d, source: "device" as const }));
    }
  }

  const seenEndpoints = new Set<string>();
  const subs = [...orderSubs, ...deviceSubs].filter((s) => {
    if (seenEndpoints.has(s.endpoint)) return false;
    seenEndpoints.add(s.endpoint);
    return true;
  });
  if (subs.length === 0) return;

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
          const table = sub.source === "order" ? "order_push_subscriptions" : "push_devices";
          await supabaseAdmin.from(table).delete().eq("id", sub.id);
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

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getVapidPublicKey, subscribeToOrderPush } from "@/lib/api.functions";
import { registerDevice } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function NotifyMeButton({ orderId }: { orderId: string }) {
  const getKeyFn = useServerFn(getVapidPublicKey);
  const subscribeFn = useServerFn(subscribeToOrderPush);
  const registerDeviceFn = useServerFn(registerDevice);
  const [state, setState] = useState<"idle" | "loading" | "subscribed" | "unsupported">("idle");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    // If a subscription already exists for this device, reflect that instead
    // of offering to subscribe again.
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      const existing = await reg?.pushManager.getSubscription();
      if (existing) setState("subscribed");
    });
  }, []);

  async function subscribe() {
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked — you can still check this page anytime.");
        setState("idle");
        return;
      }
      const { key } = await getKeyFn();
      if (!key) throw new Error("Notifications aren't configured yet.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await subscribeFn({
        data: {
          orderId,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      });
      // If they're signed in, this same grant should cover every future
      // order and broadcast too -- not just this one -- so it doesn't ask
      // again next time. Best-effort: a guest checkout (no session) simply
      // skips this and keeps the per-order subscription above.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        try {
          await registerDeviceFn({
            data: {
              endpoint: json.endpoint!,
              p256dh: json.keys!.p256dh!,
              auth: json.keys!.auth!,
            },
          });
        } catch {
          // Non-fatal -- the per-order subscription above already succeeded.
        }
      }
      setState("subscribed");
      toast.success("You'll get a notification when your order updates");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn on notifications");
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  if (state === "subscribed") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--success)]">
        <BellRing className="h-3.5 w-3.5" />
        Notifying you about this order
      </div>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={state === "loading"}
      className="tap-scale flex items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold"
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      Notify me about updates
    </button>
  );
}

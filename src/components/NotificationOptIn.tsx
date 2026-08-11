import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getVapidPublicKey } from "@/lib/api.functions";
import { registerDevice } from "@/lib/notifications.functions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Account-level notification opt-in (order updates, offers, announcements) --
// distinct from NotifyMeButton, which subscribes a single device to one
// order's updates. This is the one-time opt-in the generic notification
// platform (push_devices/notification_campaigns) needs to have anyone to
// actually deliver to.
export function NotificationOptIn() {
  const getKeyFn = useServerFn(getVapidPublicKey);
  const registerFn = useServerFn(registerDevice);
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
        toast.error("Notifications were blocked in your browser settings.");
        setState("idle");
        return;
      }
      const { key } = await getKeyFn();
      if (!key) throw new Error("Notifications aren't configured yet.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      const json = sub.toJSON();
      await registerFn({
        data: {
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      });
      setState("subscribed");
      toast.success("Notifications turned on for this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn on notifications");
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  return (
    <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Order & offer notifications</div>
        <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
          Get a push on this device for order updates and MyTown announcements.
        </p>
      </div>
      {state === "subscribed" ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[color:var(--success)]">
          <BellRing className="h-4 w-4" />
          On
        </div>
      ) : (
        <button
          onClick={subscribe}
          disabled={state === "loading"}
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {state === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          Turn on
        </button>
      )}
    </div>
  );
}

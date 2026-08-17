import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, BellRing, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getVapidPublicKey } from "@/lib/api.functions";
import { registerDevice } from "@/lib/notifications.functions";
import { toUserMessage } from "@/lib/errors";

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
  const [state, setState] = useState<"idle" | "loading" | "subscribed" | "unsupported" | "blocked">(
    "idle",
  );
  const [showHelp, setShowHelp] = useState(false);

  // Re-checks permission after the customer changes it in site settings.
  // Browsers give no event for that, so this runs when they dismiss the help.
  async function recheck() {
    setShowHelp(false);
    if (Notification.permission === "granted") {
      await subscribe();
    } else if (Notification.permission === "denied") {
      toast.error("Still blocked. Change it in site settings, then tap again.");
    } else {
      setState("idle");
    }
  }

  // The Permissions API fires a change event when the customer flips
  // notifications in site settings, which is the one signal browsers do give
  // us after a denial. Listening for it means they come back to a toggle
  // that's already on, instead of having to find and press "check again".
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (cancelled || !status) return;
      if (status.state === "granted") void subscribe(true);
      else if (status.state === "denied") setState("blocked");
      else setState("idle");
    };
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      // Safari historically rejects this query; the manual path still works.
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      if (existing) {
        // Re-register rather than just showing "On".
        //
        // push_devices is keyed by endpoint and stores the user_id it was
        // registered under. A browser keeps one push subscription per site,
        // so when a second person signs in on the same device the endpoint is
        // unchanged -- and because this branch used to return early, the row
        // kept pointing at whoever subscribed first. The new signer got no
        // notifications at all, and their updates went to the previous user.
        // Re-upserting on every mount rebinds the endpoint to whoever is
        // signed in now.
        const json = existing.toJSON();
        try {
          await registerFn({
            data: {
              endpoint: json.endpoint!,
              p256dh: json.keys!.p256dh!,
              auth: json.keys!.auth!,
            },
          });
        } catch {
          // Not signed in, or offline. The subscription is still live, so
          // showing "On" is honest -- the next mount will rebind.
        }
        setState("subscribed");
        return;
      }
      // Browser already refused permission. requestPermission() cannot
      // re-prompt after a denial -- it resolves "denied" without showing
      // anything, in every major browser -- so the only honest move is to
      // point at site settings and watch for the change.
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      // Permission already granted elsewhere but no live subscription: heal it
      // silently so the toggle shows "On" without making the user tap again.
      if (Notification.permission === "granted") void subscribe(true);
    })();
  }, [registerFn]);

  async function subscribe(silent = false) {
    if (!silent) setState("loading");
    try {
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          if (!silent) toast.error("Notifications were blocked in your browser settings.");
          setState(permission === "denied" ? "blocked" : "idle");
          return;
        }
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
      if (!silent) toast.success("Notifications turned on for this device");
    } catch (err) {
      if (!silent) toast.error(toUserMessage(err, "Couldn't turn on notifications"));
      setState("idle");
    }
  }

  if (state === "unsupported") return null;

  return (
    <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Notifications</div>
        <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
          Order updates & offers on this device.
        </p>
      </div>
      {state === "subscribed" ? (
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[color:var(--success)]">
          <BellRing className="h-4 w-4" />
          On
        </div>
      ) : state === "blocked" ? (
        // A dead "Blocked — enable in browser site settings" label was a dead
        // end: it named the problem and offered no way out. The browser won't
        // let us re-prompt, but it will let us say exactly where the switch is
        // and re-check the moment they come back.
        <button
          onClick={() => setShowHelp(true)}
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--warning)] px-3 py-1.5 text-xs font-semibold text-[color:var(--warning)]"
        >
          <BellOff className="h-3.5 w-3.5" />
          Blocked — fix
        </button>
      ) : (
        <button
          onClick={() => subscribe()}
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
      {showHelp && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setShowHelp(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Turn notifications back on"
            onClick={(e) => e.stopPropagation()}
            className="sheet-in w-full max-w-[440px] rounded-t-3xl bg-[color:var(--bg-elevated)] p-5 sm:rounded-3xl"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-display text-lg font-semibold">Turn notifications back on</div>
              <button
                onClick={() => setShowHelp(false)}
                aria-label="Close"
                className="tap-scale rounded-full p-1.5 hover:surface-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Once notifications are blocked, browsers don't let a site ask again — the permission
              has to be changed in settings. It takes two taps:
            </p>
            <ol className="mt-3 space-y-2 text-sm">
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full accent-gradient text-[11px] font-bold">
                  1
                </span>
                <span>
                  Tap the lock or <span className="font-semibold">⋮</span> icon next to the web
                  address at the top of this page.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full accent-gradient text-[11px] font-bold">
                  2
                </span>
                <span>
                  Open <span className="font-semibold">Permissions</span> or{" "}
                  <span className="font-semibold">Site settings</span>, then set{" "}
                  <span className="font-semibold">Notifications</span> to Allow.
                </span>
              </li>
            </ol>
            <button
              onClick={recheck}
              className="tap-scale accent-gradient mt-4 w-full rounded-full py-3 font-semibold"
            >
              I've allowed it — check again
            </button>
            <p className="mt-2 text-center text-xs text-[color:var(--text-muted)]">
              We'll usually notice on our own the moment you change it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

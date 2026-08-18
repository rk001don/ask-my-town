export type PushUiState = "idle" | "loading" | "subscribed" | "unsupported" | "blocked";

/**
 * The state a notification toggle should render on its very first paint,
 * read synchronously instead of defaulting to "off" and asyncing its way to
 * the truth a moment later.
 *
 * `Notification.permission` is a plain synchronous getter -- unlike
 * `serviceWorker.getRegistration()` / `pushManager.getSubscription()`, which
 * are Promises because they may talk to the browser's push service. Reading
 * it up front means an already-subscribed visitor sees "On" immediately,
 * with no flash of "Turn on" first. The async subscription check still runs
 * afterward to actually (re)register the device -- it just doesn't have to
 * gate the initial paint, since permission already tells us which UI to show.
 */
export function initialPushUiState(): PushUiState {
  if (typeof window === "undefined" || !("Notification" in window)) return "idle";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "granted") return "subscribed";
  if (Notification.permission === "denied") return "blocked";
  return "idle";
}

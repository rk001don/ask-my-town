import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { linkCustomerToMe } from "@/lib/auth.functions";
import { registerDevice } from "@/lib/notifications.functions";
import { isUserError } from "@/lib/errors";
import { forgetGuestOrder, pendingGuestOrders } from "@/lib/guest-orders";

/**
 * Runs once per signed-in session, app-wide. Renders nothing.
 *
 * Two things have to happen the moment someone signs in, and neither can live
 * on a single screen:
 *
 * 1. Orders placed on this device while signed out get attached to the
 *    account, so nobody has to type an order ID. See lib/guest-orders. This is
 *    safe on a shared device because each order ID is a credential the placing
 *    device holds; claiming re-points the order, it never copies a name onto
 *    anyone's profile.
 *
 * 2. This device's push subscription gets re-bound to whoever is now signed
 *    in. A browser keeps one push subscription per site, so when a second
 *    person signs in the endpoint is unchanged and push_devices still points
 *    at the previous user -- the new signer gets nothing and their order
 *    updates go to someone else. This used to be healed only by opening the
 *    Orders screen, which most people never did before their first
 *    notification was already missed.
 *
 * What this deliberately does NOT do: seed a new account's name/address from
 * anything stored in the browser. A profile's name is identity, and identity
 * must only ever be written by the authenticated user it belongs to -- never
 * carried over from whoever last typed into this browser. On a shared phone
 * (common in this user base -- the original identity bug came from two people
 * on one number) that carry-over would show a fresh account someone else's
 * name. Signed-in checkout and the profile editor are the only writers of an
 * account's name, and both are scoped to the caller's own user_id.
 */
export function SessionSync() {
  const claimFn = useServerFn(linkCustomerToMe);
  const registerFn = useServerFn(registerDevice);

  useEffect(() => {
    let cancelled = false;

    async function claimGuestOrders() {
      const ids = pendingGuestOrders();
      if (!ids.length) return;
      let claimed = 0;
      for (const id of ids) {
        if (cancelled) return;
        try {
          await claimFn({ data: { orderId: id } });
          forgetGuestOrder(id);
          claimed++;
        } catch (err) {
          // A written message means a settled answer -- already on another
          // account, or no longer there -- so stop retrying it. Anything else
          // is a network blip; keep it for the next sign-in.
          if (isUserError(err)) forgetGuestOrder(id);
        }
      }
      if (claimed && !cancelled) {
        toast.success(
          claimed === 1
            ? "Your earlier order is now in your account"
            : `${claimed} earlier orders added to your account`,
        );
      }
    }

    async function rebindPushDevice() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return; // nothing subscribed on this device yet
        const json = sub.toJSON();
        await registerFn({
          data: {
            endpoint: json.endpoint!,
            p256dh: json.keys!.p256dh!,
            auth: json.keys!.auth!,
          },
        });
      } catch {
        // Offline, or the session isn't usable yet. The Orders screen still
        // re-registers on mount as a second chance.
      }
    }

    async function sync() {
      await claimGuestOrders();
      await rebindPushDevice();
    }

    let unsubscribe: (() => void) | undefined;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (data.session && !cancelled) await sync();

      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        // SIGNED_IN covers a fresh sign-in; the others cover a session that
        // was restored from storage on a later visit.
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void sync();
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [claimFn, registerFn]);

  return null;
}

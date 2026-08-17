import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyProfile, linkCustomerToMe, updateMyProfile } from "@/lib/auth.functions";
import { registerDevice } from "@/lib/notifications.functions";
import { isUserError } from "@/lib/errors";
import { forgetGuestOrder, pendingGuestOrders } from "@/lib/guest-orders";

/** Written by checkout; the same key its own prefill reads. */
const GUEST_DETAILS_KEY = "mytown.customer.v1";

/**
 * Runs once per signed-in session, app-wide. Renders nothing.
 *
 * Two things have to happen the moment someone signs in, and neither can live
 * on a single screen:
 *
 * 1. Orders placed on this device while signed out get attached to the
 *    account, so nobody has to type an order ID. See lib/guest-orders.
 *
 * 2. This device's push subscription gets re-bound to whoever is now signed
 *    in. A browser keeps one push subscription per site, so when a second
 *    person signs in the endpoint is unchanged and push_devices still points
 *    at the previous user -- the new signer gets nothing and their order
 *    updates go to someone else. This used to be healed only by opening the
 *    Orders screen, which most people never did before their first
 *    notification was already missed.
 */
export function SessionSync() {
  const claimFn = useServerFn(linkCustomerToMe);
  const registerFn = useServerFn(registerDevice);
  const profileFn = useServerFn(getMyProfile);
  const saveProfileFn = useServerFn(updateMyProfile);

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

    /**
     * Seed a brand-new account from the details this device already has.
     *
     * Someone who ordered as a guest has typed their name and address once
     * already; making them type it again after signing up is the kind of
     * friction that makes an account feel like a downgrade. Only ever fills
     * gaps -- an account that already has a name is left alone.
     */
    async function seedProfileFromGuestCheckout() {
      try {
        const raw = localStorage.getItem(GUEST_DETAILS_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          name?: string;
          phone?: string;
          address?: string;
          landmark?: string;
        };
        if (!saved?.name?.trim()) return;

        const profile = await profileFn();
        if (profile?.name?.trim() && profile?.address?.trim()) return; // already set up

        await saveProfileFn({
          data: {
            name: profile?.name?.trim() || saved.name.trim(),
            phone: profile?.phone?.trim() || saved.phone?.trim() || undefined,
            address: profile?.address?.trim() || saved.address?.trim() || undefined,
            landmark: profile?.landmark?.trim() || saved.landmark?.trim() || undefined,
          },
        });
      } catch {
        /* convenience only -- the account still works, they just retype once */
      }
    }

    async function sync() {
      await claimGuestOrders();
      await seedProfileFromGuestCheckout();
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
  }, [claimFn, registerFn, profileFn, saveProfileFn]);

  return null;
}

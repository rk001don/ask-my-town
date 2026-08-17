// Order IDs placed from this device while signed out.
//
// This is what makes guest orders attach themselves to an account
// automatically at sign-in, without going back to matching on phone number --
// which is precisely how one customer's orders ended up under another's.
//
// The order ID is the credential the server already accepts as proof (it's
// random and only we and the customer ever see it). Keeping it in
// localStorage means the claim is scoped to the device that actually placed
// the order: knowing someone's phone number still gets you nothing, and
// nothing is claimable from a device that wasn't there.
//
// Cross-device is deliberately not covered -- ordering on one phone and
// signing in on another still needs "Add a past order". Any automatic answer
// there would have to match on something the customer types, and that is the
// unsafe thing.

const KEY = "mytown.guestOrders.v1";
/** Long enough to cover "I ordered, then made an account weeks later". */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_KEPT = 20;

type Entry = { id: string; at: number };

function read(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(
      (e): e is Entry =>
        !!e &&
        typeof (e as Entry).id === "string" &&
        typeof (e as Entry).at === "number" &&
        (e as Entry).at > cutoff,
    );
  } catch {
    // Private browsing, quota, or corrupted JSON. Claiming is a convenience;
    // "Add a past order" is always still there.
    return [];
  }
}

function write(entries: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_KEPT)));
  } catch {
    /* non-fatal -- the order is already placed */
  }
}

/** Call after a guest checkout succeeds. */
export function rememberGuestOrder(orderId: string) {
  const entries = read().filter((e) => e.id !== orderId);
  entries.push({ id: orderId, at: Date.now() });
  write(entries);
}

/** Order IDs still waiting to be claimed by an account. */
export function pendingGuestOrders(): string[] {
  return read().map((e) => e.id);
}

/** Drop one, whether it was claimed or turned out not to be claimable. */
export function forgetGuestOrder(orderId: string) {
  write(read().filter((e) => e.id !== orderId));
}

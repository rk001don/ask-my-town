import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { trackOrder } from "@/lib/api.functions";
import { cancelMyOrder, getMyOrders, getMyProfile, updateMyProfile } from "@/lib/auth.functions";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import {
  CUSTOMER_ORDER_STEPS,
  DELIVERY_ETA_LABEL,
  STATUS_COPY,
  customerFacingStatus,
  type OrderStatus,
} from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  BadgeCheck,
  XCircle,
  Check,
  Clock,
  Sparkles,
  LogOut,
  Pencil,
  X,
} from "lucide-react";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { NotificationOptIn } from "@/components/NotificationOptIn";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { formatOrderTimestamp } from "@/lib/time";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Orders — MyTown" },
      { name: "description", content: "Track your MyTown orders by phone or order ID." },
    ],
  }),
  component: Activity,
});

type Order = Awaited<ReturnType<typeof trackOrder>>["orders"][number];

function Activity() {
  const [authChecked, setAuthChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) {
    return (
      <div>
        <AppHeader title="Orders" showBack={false} showSearch={false} showChat />
        <div className="space-y-3 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Logged-in customers already have an identity the server can use to find
  // their own orders -- making them type their phone number again to "track"
  // something the app could already show them is exactly the redundant step
  // that was confusing here. Guests, who have no identity to look up by,
  // still need the manual tracker below.
  return loggedIn ? <MyActivity /> : <GuestTracker />;
}

function MyActivity() {
  const fetchOrders = useServerFn(getMyOrders);
  const cancelOrderFn = useServerFn(cancelMyOrder);
  const profileFn = useServerFn(getMyProfile);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) return;

      // A person's name is what they expect to see, not the credential they
      // happened to sign in with. Someone who signed up by phone was shown
      // either their own phone number back or -- when Auth had no phone on
      // the user row, which is the case for PIN accounts -- nothing at all.
      // The profile has held their real name the whole time.
      let display: string | null = null;
      try {
        const profile = await profileFn();
        display = profile?.name?.trim() || null;
      } catch {
        // Profile lookup is a nicety; fall through to the credential below.
      }

      if (!display) {
        const email = u.email && !u.email.endsWith("@customers.mytown.internal") ? u.email : null;
        display = email ?? u.phone ?? (u.user_metadata?.phone as string | undefined) ?? null;
      }
      if (!cancelled) setIdentity(display);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileFn]);

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      qc.clear();
      toast.success("Signed out");
      nav({ to: "/" });
    } catch {
      setSigningOut(false);
      toast.error("Couldn't sign out. Try again.");
    }
  }

  async function confirmCancellation(reason: string) {
    if (!cancelOrderId) return;
    setCancelling(true);
    try {
      await cancelOrderFn({ data: { orderId: cancelOrderId, reason: reason || undefined } });
      toast.success("Order cancelled");
      setCancelOrderId(null);
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (err) {
      toast.error(toUserMessage(err, "Cancellation failed"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div>
      <AppHeader title="Orders" showBack={false} showSearch={false} showChat />
      <div className="px-4 pt-2">
        <div className="glass mb-3 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Your account</div>
              {identity && (
                <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
                  {identity}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Edit is an icon beside Sign out rather than a labelled row of
                  its own -- it saves a whole band of vertical space above the
                  orders, which is what people actually came here for. */}
              <button
                onClick={() => setEditingProfile(true)}
                aria-label="Edit your details"
                title="Edit your details"
                className="tap-scale grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border-strong)]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={signOut}
                disabled={signingOut}
                className="tap-scale flex items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
        <div className="glass mb-3 flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Appearance</div>
            <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
              Light, dark, or match your device.
            </p>
          </div>
          <ThemeToggle />
        </div>
        <NotificationOptIn />
      </div>
      {isLoading && (
        <div className="space-y-3 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {error && <ErrorState />}
      {data && data.length === 0 && (
        <EmptyState title="No orders yet" message="Once you place an ask, it'll show up here." />
      )}
      {data && data.length > 0 && (
        <ul className="space-y-3 p-4 pb-8">
          {data.map((o) => (
            <OrderCard key={o.id} order={o as unknown as Order} onCancel={setCancelOrderId} />
          ))}
        </ul>
      )}
      <CancelOrderDialog
        open={cancelOrderId !== null}
        orderId={cancelOrderId}
        reasonOptional
        busy={cancelling}
        onOpenChange={(open) => !open && setCancelOrderId(null)}
        onConfirm={confirmCancellation}
      />
      {editingProfile && (
        <ProfileDialog
          onClose={() => setEditingProfile(false)}
          onSaved={(name) => {
            setIdentity(name);
            setEditingProfile(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Edit the signed-in customer's own name and address.
 *
 * Also the repair path for anyone whose profile was overwritten by someone
 * else's checkout before identity stopped being keyed on phone number -- that
 * data can't be recovered automatically, because nothing recorded what it used
 * to say.
 */
function ProfileDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const profileFn = useServerFn(getMyProfile);
  const saveFn = useServerFn(updateMyProfile);
  const [form, setForm] = useState({ name: "", phone: "", address: "", landmark: "", pincode: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    profileFn()
      .then((p) => {
        if (cancelled) return;
        setForm({
          name: p?.name ?? "",
          phone: p?.phone ?? "",
          address: p?.address ?? "",
          landmark: p?.landmark ?? "",
          pincode: p?.pincode ?? "",
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profileFn]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFn({ data: form });
      toast.success("Details saved");
      onSaved(form.name.trim());
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't save your details"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Your details" onClose={onClose}>
      {loading ? (
        <div className="skeleton h-40 rounded-2xl" />
      ) : (
        <form onSubmit={save} className="space-y-3">
          {(
            [
              ["name", "Name", "Your name"],
              ["phone", "Mobile", "10-digit number"],
              ["address", "Address", "House, street, area"],
              ["landmark", "Landmark (optional)", "Near…"],
              ["pincode", "Pincode (optional)", "6-digit pincode"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold text-[color:var(--text-secondary)]">
                {label}
              </span>
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                inputMode={key === "phone" ? "numeric" : "text"}
                className="mt-1 w-full rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] px-3 py-2.5 text-[15px] outline-none focus:border-[color:var(--accent-primary)]"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={saving || form.name.trim().length < 2}
            className="tap-scale accent-gradient w-full rounded-full py-3 font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** Bottom sheet on mobile, centred panel above it -- same shell as ProductSheet. */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in max-h-[90dvh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-[color:var(--bg-elevated)] p-5 sm:rounded-3xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="text-display text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-scale rounded-full p-1.5 hover:surface-subtle"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GuestTracker() {
  const track = useServerFn(trackOrder);
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Order ID only. Looking up by phone number used to be offered here, and it
  // returned that number's whole order history joined to the customer record
  // -- so knowing someone's mobile number was enough to read their name, home
  // address and what they'd been buying. A phone number isn't a secret and
  // can't be a credential; the order ID is one, and signed-in customers never
  // need to type anything at all.
  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await track({ data: { orderId: value } });
      setOrders(res.orders);
      setState("loaded");
    } catch (err) {
      setErrorMsg(toUserMessage(err, "Couldn't find that order. Check the ID and try again."));
      setState("error");
    }
  }

  return (
    <div>
      <AppHeader title="Orders" showBack={false} showSearch={false} showChat />
      <div className="px-4 pt-2">
        {/* Appearance isn't account data -- it's a device preference, and
            gating it behind sign-in meant a guest had no way to leave a theme
            they couldn't read. */}
        <div className="glass mb-3 flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Appearance</div>
            <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
              Light, dark, or match your device.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
      <div className="rise px-4 pb-4">
        <h2 className="text-display text-2xl font-bold">Track your order</h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          Enter the order ID from your confirmation, like MT-4A9F2C.{" "}
          <Link
            to="/auth"
            search={{ redirect: "/activity" }}
            className="font-semibold text-[color:var(--accent-primary)]"
          >
            Sign in
          </Link>{" "}
          to see all your orders without typing anything.
        </p>
        <form onSubmit={onSearch} className="mt-4">
          <div className="relative flex items-center overflow-hidden rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] focus-within:border-[color:var(--accent-primary)]">
            <Search className="pointer-events-none ml-3.5 h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase().slice(0, 20))}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Order ID (MT-…)"
              className="w-full bg-transparent py-3 pl-2 pr-4 text-[15px] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!q.trim() || state === "loading"}
            className="tap-scale mt-3 w-full rounded-full accent-gradient py-3 font-semibold disabled:opacity-60"
          >
            {state === "loading" ? "Looking…" : "Track"}
          </button>
        </form>
      </div>

      {state === "loading" && (
        <div className="space-y-3 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      )}

      {state === "error" && (
        <ErrorState
          message={errorMsg ?? "Couldn't find that order. Check the ID and try again."}
          onRetry={() => setState("idle")}
        />
      )}

      {state === "loaded" && orders && orders.length === 0 && (
        <EmptyState
          title="No order with that ID"
          message="Check the ID on your confirmation message, or ask us on WhatsApp."
        />
      )}

      {state === "loaded" && orders && orders.length > 0 && (
        <ul className="space-y-3 p-4 pb-8">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order, onCancel }: { order: Order; onCancel?: (orderId: string) => void }) {
  const status = order.status as OrderStatus;
  const displayStatus = customerFacingStatus(status);
  const idx = CUSTOMER_ORDER_STEPS.findIndex((s) => s.key === displayStatus);
  const pct = status === "cancelled" ? 0 : ((idx + 1) / CUSTOMER_ORDER_STEPS.length) * 100;
  return (
    <li className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[color:var(--text-muted)]">
            {formatOrderTimestamp(order.created_at!)}
          </div>
          <div className="text-display font-mono text-lg font-semibold tracking-wide">
            {order.id}
          </div>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase ${status === "completed" ? "bg-[color:var(--success)]/20 text-[color:var(--success)]" : status === "cancelled" ? "bg-[color:var(--danger)]/20 text-[color:var(--danger)]" : "bg-[color:var(--accent-primary)]/20 text-[color:var(--accent-primary)]"}`}
        >
          {/* The state's own icon, so the chip reads at a glance instead of
              needing a second "Delivered" pill lower down the card. */}
          {status === "completed" ? (
            <BadgeCheck className="h-3.5 w-3.5" />
          ) : status === "cancelled" ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
          {STATUS_COPY[displayStatus].label}
        </div>
      </div>
      <div className="mt-3 text-xs text-[color:var(--text-secondary)]">
        {STATUS_COPY[displayStatus].blurb}
      </div>
      {status !== "cancelled" &&
        status !== "received" &&
        status !== "completed" &&
        !order.requested_window && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--accent-primary)]">
            <Clock className="h-3 w-3" />
            {DELIVERY_ETA_LABEL}
          </div>
        )}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--bg-elevated-2)]">
        <div className="h-full accent-gradient transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {order.items.slice(0, 3).map((it, i) => (
          <li
            key={i}
            className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]"
          >
            {it.is_freeform && <Sparkles className="h-3 w-3 text-[color:var(--accent-primary)]" />}
            <span className="line-clamp-1">
              {it.item_name} × {it.quantity}
            </span>
          </li>
        ))}
        {order.items.length > 3 && (
          <li className="text-xs text-[color:var(--text-muted)]">+{order.items.length - 3} more</li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to="/order/$orderId"
          params={{ orderId: order.id }}
          className="tap-scale rounded-full border border-[color:var(--border-strong)] px-4 py-1.5 text-xs font-semibold"
        >
          View details
        </Link>
        {onCancel && status === "received" && (
          <button
            type="button"
            onClick={() => onCancel(order.id)}
            className="tap-scale rounded-full border border-[color:var(--danger)]/60 px-4 py-1.5 text-xs font-semibold text-[color:var(--danger)]"
          >
            Cancel order
          </button>
        )}
      </div>
    </li>
  );
}

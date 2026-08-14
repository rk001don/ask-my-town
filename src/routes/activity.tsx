import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { trackOrder } from "@/lib/api.functions";
import { cancelMyOrder, getMyOrders } from "@/lib/auth.functions";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import {
  CUSTOMER_ORDER_STEPS,
  DELIVERY_ETA_LABEL,
  STATUS_COPY,
  customerFacingStatus,
  type OrderStatus,
} from "@/lib/constants";
import { isValidIndianPhone } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Check, Clock, Sparkles, LogOut } from "lucide-react";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { NotificationOptIn } from "@/components/NotificationOptIn";
import { toast } from "sonner";

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
        <AppHeader title="Orders" showBack={false} />
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
  const qc = useQueryClient();
  const nav = useNavigate();
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      // Prefer a real email; phone+PIN accounts use a synthetic internal
      // email, so fall back to the phone number for those.
      const email = u?.email && !u.email.endsWith("@customers.mytown.internal") ? u.email : null;
      setIdentity(email ?? u?.phone ?? u?.user_metadata?.phone ?? null);
    });
  }, []);

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
      toast.error(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div>
      <AppHeader title="Orders" showBack={false} />
      <div className="px-4 pt-2">
        <div className="glass mb-3 flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Your account</div>
            {identity && (
              <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
                {identity}
              </p>
            )}
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="tap-scale flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
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
    </div>
  );
}

function GuestTracker() {
  const track = useServerFn(trackOrder);
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const looksLikePhone = /^\d/.test(q.trim());

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    if (looksLikePhone && !isValidIndianPhone(value)) {
      setState("error");
      return;
    }
    setState("loading");
    try {
      const res = await track({
        data: looksLikePhone ? { phone: value } : { orderId: value },
      });
      setOrders(res.orders);
      setState("loaded");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <AppHeader title="Orders" showBack={false} />
      <div className="rise p-4">
        <h2 className="text-display text-2xl font-bold">Track your ask</h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          Enter your phone or order ID (like MT-4A9F2C).{" "}
          <Link to="/auth" className="font-semibold text-[color:var(--accent-primary)]">
            Sign in
          </Link>{" "}
          to see all your orders automatically next time.
        </p>
        <form onSubmit={onSearch} className="mt-4">
          <div className="relative flex items-center overflow-hidden rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] focus-within:border-[color:var(--accent-primary)]">
            <Search className="pointer-events-none ml-3.5 h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
            {looksLikePhone && (
              <span className="ml-2 shrink-0 text-[15px] font-semibold text-[color:var(--text-secondary)]">
                +91
              </span>
            )}
            <input
              value={q}
              onChange={(e) =>
                setQ(
                  /^\d/.test(e.target.value)
                    ? e.target.value.replace(/\D/g, "").slice(0, 10)
                    : e.target.value,
                )
              }
              inputMode={looksLikePhone ? "numeric" : "text"}
              placeholder="Phone or order ID"
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
          message={
            looksLikePhone
              ? "Enter a valid 10-digit mobile number."
              : "Couldn't find that. Double-check the number or ID."
          }
          onRetry={() => setState("idle")}
        />
      )}

      {state === "loaded" && orders && orders.length === 0 && (
        <EmptyState
          title="No orders found"
          message="We couldn't find anything matching that. Double-check the number or ID."
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
            {new Date(order.created_at!).toLocaleString()}
          </div>
          <div className="text-display font-mono text-lg font-semibold tracking-wide">
            {order.id}
          </div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${status === "completed" ? "bg-[color:var(--success)]/20 text-[color:var(--success)]" : status === "cancelled" ? "bg-[color:var(--danger)]/20 text-[color:var(--danger)]" : "bg-[color:var(--accent-primary)]/20 text-[color:var(--accent-primary)]"}`}
        >
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
        {idx >= CUSTOMER_ORDER_STEPS.length - 1 && (
          <span className="inline-flex items-center gap-1 text-xs text-[color:var(--success)]">
            <Check className="h-3.5 w-3.5" /> Done
          </span>
        )}
      </div>
    </li>
  );
}

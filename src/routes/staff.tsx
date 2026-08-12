import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/auth.functions";
import {
  cancelStaffOrder,
  listStaffOrders,
  updateStaffOrderStatus,
  getAttachmentSignedUrl,
} from "@/lib/staff.functions";
import { ORDER_STATUS_STEPS, STATUS_COPY, type OrderStatus } from "@/lib/constants";
import { getLocations } from "@/lib/api.functions";
import { formatTimeRange12h } from "@/lib/time";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState } from "@/components/States";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  RefreshCw,
  Phone,
  MapPin,
  ShieldAlert,
  Paperclip,
  X,
  Clock,
  Package,
  CheckCircle2,
  XCircle,
  Truck,
} from "lucide-react";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [{ title: "Staff console — MyTown" }, { name: "robots", content: "noindex" }],
  }),
  component: StaffPage,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

const BOARD_STATUSES: OrderStatus[] = [
  "received",
  "confirmed",
  "arranging",
  "on_the_way",
  "completed",
];

type StaffOrderRow = {
  id: string;
  status: OrderStatus;
  requested_date?: string | null;
  requested_window?: string | null;
  service_fee_estimate?: number | null;
  service_fee_final?: number | null;
  cancellation_reason?: string | null;
  customer: {
    name: string;
    phone: string;
    address: string;
    landmark: string | null;
  } | null;
  items: {
    item_name: string;
    quantity: number;
    notes: string | null;
    is_freeform: boolean;
    unit_price?: number | null;
    attachments?: { id: string; file_path: string; file_type: string }[];
  }[];
};

function StaffOrderCard({
  order: o,
  onOpenAttachment,
  onAdvance,
  onCancel,
  windowRanges,
  isAdvancing,
}: {
  order: StaffOrderRow;
  onOpenAttachment: (filePath: string) => void;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  onCancel: (orderId: string) => void;
  windowRanges: Record<string, string>;
  isAdvancing: boolean;
}) {
  const idx = ORDER_STATUS_STEPS.findIndex((st) => st.key === o.status);
  // A cancelled order isn't on the step ladder (idx === -1) — it must never
  // offer "Mark Received" as if it were a fresh order.
  const nextStep =
    idx === -1 ? undefined : (ORDER_STATUS_STEPS[idx + 1]?.key as OrderStatus | undefined);

  const priced = o.items.filter((it) => it.unit_price != null);
  const orderTotal = priced.reduce((n, it) => n + (it.unit_price ?? 0) * it.quantity, 0);
  const serviceFee = o.service_fee_final ?? o.service_fee_estimate ?? null;

  const statusColor: Record<string, string> = {
    received: "var(--warning)",
    confirmed: "var(--info)",
    arranging: "var(--accent-primary)",
    on_the_way: "var(--accent-secondary)",
    completed: "var(--success)",
    cancelled: "var(--danger)",
  };

  return (
    <div className="card-surface rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: statusColor[o.status] ?? "var(--text-muted)" }}
          />
          <span className="truncate font-mono text-xs text-[color:var(--text-muted)]">
            {o.id.slice(0, 8)}
          </span>
        </div>
        {o.requested_window && (
          <span className="flex items-center gap-1 flex-shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
            <Clock className="h-2.5 w-2.5" />
            {o.requested_window}
            {windowRanges[o.requested_window] ? ` (${windowRanges[o.requested_window]})` : ""}
          </span>
        )}
      </div>
      {o.status === "cancelled" && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-2.5 py-1.5 text-[11px] text-[color:var(--danger)]">
          <XCircle className="h-3 w-3 flex-shrink-0" />
          Cancelled{o.cancellation_reason ? ` — ${o.cancellation_reason}` : ""}
        </div>
      )}
      <div className="mt-2 text-sm font-semibold">{o.customer?.name}</div>
      <a
        href={`tel:${o.customer?.phone ?? ""}`}
        className="tap-scale mt-1 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent-primary)]/10 px-2.5 py-1 text-xs font-medium text-[color:var(--accent-primary)]"
      >
        <Phone className="h-3 w-3" /> {o.customer?.phone}
      </a>
      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[color:var(--text-secondary)]">
        <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
        <span className="line-clamp-2">
          {o.customer?.address}
          {o.customer?.landmark ? ` · ${o.customer.landmark}` : ""}
        </span>
      </div>
      {priced.length > 0 && (
        <div className="mt-2 space-y-0.5 rounded-xl bg-white/5 p-2 text-xs">
          <div className="flex justify-between text-[color:var(--text-secondary)]">
            <span>Items subtotal</span>
            <span>₹{orderTotal}</span>
          </div>
          <div className="flex justify-between text-[color:var(--text-secondary)]">
            <span>Service fee</span>
            <span>{serviceFee == null ? "To confirm" : `₹${serviceFee}`}</span>
          </div>
          <div className="flex justify-between font-bold text-[color:var(--accent-primary)]">
            <span>Total</span>
            <span>₹{orderTotal + (serviceFee ?? 0)}</span>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-1 text-xs">
        {o.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
            <span className="font-semibold text-[color:var(--accent-primary)]">{it.quantity}×</span>
            <span className="flex-1 text-[color:var(--text-primary)]">
              {it.item_name}
              {it.notes ? (
                <span className="block text-[color:var(--text-tertiary)]">{it.notes}</span>
              ) : null}
            </span>
            {(it.attachments ?? []).map((att) => (
              <button
                key={att.id}
                onClick={() => onOpenAttachment(att.file_path)}
                className="tap-scale flex shrink-0 items-center gap-0.5 rounded-full bg-[color:var(--accent-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent-primary)]"
                aria-label="View attached photo"
              >
                <Paperclip className="h-2.5 w-2.5" /> photo
              </button>
            ))}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        {nextStep && (
          <button
            onClick={() => onAdvance(o.id, nextStep)}
            disabled={isAdvancing}
            className="tap-scale flex flex-1 items-center justify-center gap-1.5 rounded-full accent-gradient px-3 py-2.5 text-xs font-semibold text-[color:var(--on-accent)] disabled:opacity-50"
          >
            {isAdvancing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : nextStep === "on_the_way" ? (
              <Truck className="h-3.5 w-3.5" />
            ) : nextStep === "completed" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Package className="h-3.5 w-3.5" />
            )}
            Mark {STATUS_COPY[nextStep]?.label ?? nextStep}
          </button>
        )}
        {o.status !== "cancelled" && o.status !== "completed" && (
          <button
            onClick={() => onCancel(o.id)}
            className="tap-scale rounded-full border border-[color:var(--danger)]/50 px-3 py-2.5 text-xs font-semibold text-[color:var(--danger)]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function StaffPage() {
  const nav = useNavigate();
  const [session, setSession] = useState<null | { email: string | null }>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSession(data.user ? { email: data.user.email ?? null } : null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s?.user ? { email: s.user.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking)
    return (
      <div>
        <AppHeader title="Staff" showCart={false} showSearch={false} />
        <div className="p-6">
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </div>
    );
  if (!session) return <StaffSignIn onDone={() => {}} />;

  return (
    <StaffBoard
      email={session.email}
      onSignOut={async () => {
        await supabase.auth.signOut();
        toast.success("Signed out");
        nav({ to: "/staff" });
      }}
    />
  );
}

function StaffSignIn(_: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
  }

  return (
    <div>
      <AppHeader title="Staff sign in" showCart={false} showSearch={false} />
      <div className="mx-auto max-w-sm px-5 pt-4 pb-24">
        <div className="glass rounded-3xl p-5">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[color:var(--accent-primary)]" />
            <h2 className="text-display text-xl font-semibold">Staff only</h2>
          </div>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Sign in with your MyTown staff account. Access is controlled by role.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@mytown.example"
              className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-black/20 px-4 py-3 outline-none focus:border-[color:var(--accent-primary)]"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-black/20 px-4 py-3 outline-none focus:border-[color:var(--accent-primary)]"
            />
            <button
              disabled={busy}
              className="tap-scale flex w-full items-center justify-center gap-2 rounded-full accent-gradient px-4 py-3 font-semibold text-[color:var(--on-accent)]"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StaffBoard({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const qc = useQueryClient();
  const rolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listStaffOrders);
  const updateFn = useServerFn(updateStaffOrderStatus);
  const cancelFn = useServerFn(cancelStaffOrder);
  const signedUrlFn = useServerFn(getAttachmentSignedUrl);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<"active" | OrderStatus>("active");
  const [groupByWindow, setGroupByWindow] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);

  async function openAttachment(filePath: string) {
    setPreviewLoading(true);
    try {
      const { url } = await signedUrlFn({ data: { filePath } });
      setPreviewUrl(url);
    } catch {
      toast.error("Couldn't load that photo");
    } finally {
      setPreviewLoading(false);
    }
  }

  const locationsFn = useServerFn(getLocations);
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn(), staleTime: 60_000 });
  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsFn(),
    staleTime: 5 * 60_000,
  });
  const windowRanges = useMemo(() => {
    const windows =
      (
        locationsQ.data?.[0]?.config as
          { delivery_windows?: { label: string; start: string; end: string }[] } | undefined
      )?.delivery_windows ?? [];
    const map: Record<string, string> = {};
    for (const w of windows) map[w.label] = formatTimeRange12h(w.start, w.end);
    return map;
  }, [locationsQ.data]);
  const ordersQ = useQuery({
    queryKey: ["staff-orders"],
    queryFn: () => listFn(),
    enabled: rolesQ.data?.isStaff ?? false,
    refetchInterval: 15_000,
  });

  const grouped = useMemo(() => {
    const g: Record<OrderStatus, typeof ordersQ.data extends { orders: infer T } ? T : never> = {
      received: [],
      confirmed: [],
      arranging: [],
      on_the_way: [],
      completed: [],
      cancelled: [],
    } as never;
    const data = ordersQ.data;
    if (!data || data.aggregateOnly) return g;
    (data.orders ?? []).forEach((o) => {
      const s = (o.status ?? "received") as OrderStatus;
      (g[s] as unknown as unknown[])?.push(o);
    });
    return g;
  }, [ordersQ.data]);

  async function setStatus(orderId: string, next: OrderStatus) {
    if (advancingOrderId) return;
    setAdvancingOrderId(orderId);
    try {
      await updateFn({ data: { orderId, status: next } });
      toast.success(`Marked ${STATUS_COPY[next]?.label ?? next}`);
      qc.invalidateQueries({ queryKey: ["staff-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setAdvancingOrderId(null);
    }
  }

  async function confirmCancellation(reason: string) {
    if (!cancelOrderId) return;
    setCancelling(true);
    try {
      await cancelFn({ data: { orderId: cancelOrderId, reason: reason || "Cancelled by staff." } });
      toast.success("Order cancelled");
      setCancelOrderId(null);
      qc.invalidateQueries({ queryKey: ["staff-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  }

  if (rolesQ.isLoading) {
    return (
      <div className="p-6">
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }
  if (!rolesQ.data?.isStaff) {
    return (
      <div>
        <AppHeader title="Staff console" showCart={false} showSearch={false} />
        <div className="mx-auto max-w-sm px-5 pt-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-[color:var(--warning)]" />
          <h2 className="mt-3 text-display text-xl font-semibold">No staff access</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            You're signed in as <span className="font-mono">{email}</span>, but no staff role is
            assigned to this account. Ask an admin to grant access.
          </p>
          <button
            onClick={onSignOut}
            className="tap-scale mt-4 rounded-full border border-[color:var(--border-strong)] px-4 py-2 text-sm font-semibold"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="sticky top-0 z-[var(--z-header)] glass flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-display text-lg font-semibold">Live orders</div>
            {ordersQ.isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--accent-primary)]" />
            )}
          </div>
          <div className="truncate text-xs text-[color:var(--text-tertiary)]">
            {email} · {rolesQ.data.roles.join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["staff-orders"] })}
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/5"
            aria-label="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={onSignOut}
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/5"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {ordersQ.data?.aggregateOnly ? (
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold">Daily delivery counts</div>
            <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
              You have viewer access — this shows totals only, not individual order details.
            </p>
            <div className="mt-4 space-y-2">
              {(ordersQ.data.dailyCounts ?? []).map(
                (d: { delivery_date: string; total_orders: number; completed_orders: number }) => (
                  <div
                    key={d.delivery_date}
                    className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"
                  >
                    <span>{d.delivery_date}</span>
                    <span className="text-[color:var(--text-secondary)]">
                      {d.completed_orders}/{d.total_orders} completed
                    </span>
                  </div>
                ),
              )}
              {(ordersQ.data.dailyCounts ?? []).length === 0 && (
                <div className="text-sm text-[color:var(--text-tertiary)]">
                  No orders in the last 30 days.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="no-scrollbar hidden gap-4 overflow-x-auto px-4 py-4 md:flex md:snap-x md:snap-mandatory md:px-6">
            {BOARD_STATUSES.map((s) => {
              const list = (grouped[s] as unknown as StaffOrderRow[]) ?? [];
              return (
                <div key={s} className="min-w-[280px] flex-shrink-0 snap-start">
                  <div className="mb-3 flex items-center justify-between rounded-xl bg-[color:var(--bg-elevated)] px-3 py-2">
                    <div className="text-xs font-bold uppercase tracking-wide">
                      {STATUS_COPY[s]?.label ?? s}
                    </div>
                    <div className="grid h-5 min-w-5 place-items-center rounded-full bg-white/10 px-1 text-[10px] font-bold">
                      {list.length}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {list.map((o) => (
                      <StaffOrderCard
                        key={o.id}
                        order={{ ...o, status: s }}
                        onOpenAttachment={openAttachment}
                        onAdvance={setStatus}
                        onCancel={setCancelOrderId}
                        windowRanges={windowRanges}
                        isAdvancing={advancingOrderId === o.id}
                      />
                    ))}
                    {list.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[color:var(--border-subtle)] p-4 text-center text-xs text-[color:var(--text-muted)]">
                        Empty
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: a single vertical list with status filter pills, not a
            side-scrolling kanban — the horizontal scroll itself was the
            "why is there a sidebar-like strip on mobile" complaint. */}
          <div className="md:hidden">
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
              {(["active", ...BOARD_STATUSES] as const).map((f) => {
                const count =
                  f === "active"
                    ? BOARD_STATUSES.filter((s) => s !== "completed").reduce(
                        (n, s) => n + ((grouped[s] as unknown as StaffOrderRow[])?.length ?? 0),
                        0,
                      )
                    : ((grouped[f] as unknown as StaffOrderRow[])?.length ?? 0);
                const active = mobileFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setMobileFilter(f)}
                    className="tap-scale flex-shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold capitalize"
                    style={{
                      color: active ? "var(--on-accent)" : "var(--text-secondary)",
                      background: active
                        ? "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))"
                        : "var(--bg-elevated)",
                    }}
                  >
                    {f === "active" ? "Active" : (STATUS_COPY[f]?.label ?? f)}{" "}
                    <span style={{ opacity: 0.7 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Simple flat list stays the default; grouping by delivery
                window is opt-in for whoever's planning a trip and wants to
                see which orders can go out together, same idea as admin's
                delivery batches but scoped to what's actually in front of
                you right now. */}
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                onClick={() => setGroupByWindow(false)}
                className="tap-scale rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: !groupByWindow ? "var(--on-accent)" : "var(--text-secondary)",
                  background: !groupByWindow ? "var(--accent-primary)" : "var(--bg-elevated)",
                }}
              >
                Simple
              </button>
              <button
                onClick={() => setGroupByWindow(true)}
                className="tap-scale rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: groupByWindow ? "var(--on-accent)" : "var(--text-secondary)",
                  background: groupByWindow ? "var(--accent-primary)" : "var(--bg-elevated)",
                }}
              >
                By delivery window
              </button>
            </div>

            {(() => {
              const filteredOrders = BOARD_STATUSES.filter((s) =>
                mobileFilter === "active" ? s !== "completed" : s === mobileFilter,
              ).flatMap((s) =>
                ((grouped[s] as unknown as StaffOrderRow[]) ?? []).map((o) => ({
                  ...o,
                  status: s,
                })),
              );

              if (filteredOrders.length === 0) {
                return (
                  <div className="px-4 pb-6 pt-3">
                    <div className="card-surface flex flex-col items-center gap-2 p-8 text-center">
                      <Package className="h-8 w-8 text-[color:var(--text-muted)]" />
                      <div className="text-sm text-[color:var(--text-tertiary)]">
                        No orders here right now.
                      </div>
                    </div>
                  </div>
                );
              }

              if (!groupByWindow) {
                return (
                  <div className="space-y-3 px-4 pb-6 pt-3">
                    {filteredOrders.map((o) => (
                      <StaffOrderCard
                        key={o.id}
                        order={o}
                        onOpenAttachment={openAttachment}
                        onAdvance={setStatus}
                        onCancel={setCancelOrderId}
                        windowRanges={windowRanges}
                        isAdvancing={advancingOrderId === o.id}
                      />
                    ))}
                  </div>
                );
              }

              const groupMap = new Map<string, typeof filteredOrders>();
              for (const o of filteredOrders) {
                const key = `${o.requested_date ?? "￿"}__${o.requested_window ?? "￿"}`;
                if (!groupMap.has(key)) groupMap.set(key, []);
                groupMap.get(key)!.push(o);
              }
              const sortedGroups = [...groupMap.entries()].sort(([a], [b]) => a.localeCompare(b));

              return (
                <div className="space-y-4 px-4 pb-6 pt-3">
                  {sortedGroups.map(([key, orders]) => {
                    const [date, window] = key.split("__");
                    const label =
                      date === "￿"
                        ? "No delivery window set"
                        : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          });
                    return (
                      <div key={key}>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[color:var(--text-secondary)]">
                          <Clock className="h-3.5 w-3.5" />
                          {label}
                          {window !== "￿" && (
                            <span className="capitalize">
                              · {window}
                              {windowRanges[window] ? ` (${windowRanges[window]})` : ""}
                            </span>
                          )}
                          <span className="font-normal normal-case text-[color:var(--text-tertiary)]">
                            — {orders.length} order{orders.length === 1 ? "" : "s"}, deliverable
                            together
                          </span>
                        </div>
                        <div className="space-y-3">
                          {orders.map((o) => (
                            <StaffOrderCard
                              key={o.id}
                              order={o}
                              onOpenAttachment={openAttachment}
                              onAdvance={setStatus}
                              onCancel={setCancelOrderId}
                              windowRanges={windowRanges}
                              isAdvancing={advancingOrderId === o.id}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {(previewUrl || previewLoading) && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewUrl(null)}
        >
          {previewLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          ) : (
            <div className="relative max-h-[85vh] max-w-full">
              <img
                src={previewUrl!}
                alt="Attached photo"
                className="max-h-[85vh] max-w-full rounded-2xl object-contain"
              />
              <button
                onClick={() => setPreviewUrl(null)}
                className="tap-scale absolute -top-3 -right-3 grid h-8 w-8 place-items-center rounded-full bg-white text-black"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
      <CancelOrderDialog
        open={cancelOrderId !== null}
        orderId={cancelOrderId}
        defaultReason="Cancelled by staff."
        busy={cancelling}
        onOpenChange={(open) => !open && setCancelOrderId(null)}
        onConfirm={confirmCancellation}
      />
    </div>
  );
}

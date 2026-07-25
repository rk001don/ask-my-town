import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/auth.functions";
import { listStaffOrders, updateStaffOrderStatus } from "@/lib/staff.functions";
import { ORDER_STATUS_STEPS, STATUS_COPY, type OrderStatus } from "@/lib/constants";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "sonner";
import { Loader2, LogOut, RefreshCw, Phone, MapPin, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [{ title: "Staff console — MyTown" }, { name: "robots", content: "noindex" }],
  }),
  component: StaffPage,
});

const BOARD_STATUSES: OrderStatus[] = [
  "received",
  "confirmed",
  "arranging",
  "on_the_way",
  "completed",
];

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

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn(), staleTime: 60_000 });
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
    try {
      await updateFn({ data: { orderId, status: next } });
      toast.success(`Marked ${STATUS_COPY[next]?.label ?? next}`);
      qc.invalidateQueries({ queryKey: ["staff-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
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
      <div className="sticky top-0 z-30 glass flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-display text-lg font-semibold">Live orders</div>
          <div className="text-xs text-[color:var(--text-tertiary)]">
            {email} · roles: {rolesQ.data.roles.join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["staff-orders"] })}
            className="tap-scale rounded-full p-2 hover:bg-white/5"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-5 w-5 ${ordersQ.isFetching ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onSignOut}
            className="tap-scale rounded-full p-2 hover:bg-white/5"
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
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 py-4 md:px-6">
          {BOARD_STATUSES.map((s) => {
            const list =
              (grouped[s] as unknown as Array<{
                id: string;
                requested_date?: string | null;
                requested_window?: string | null;
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
                }[];
              }>) ?? [];
            return (
              <div key={s} className="min-w-[85vw] flex-shrink-0 snap-start sm:min-w-[260px]">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                    {STATUS_COPY[s]?.label ?? s}
                  </div>
                  <div className="text-xs text-[color:var(--text-tertiary)]">{list.length}</div>
                </div>
                <div className="space-y-2">
                  {list.map((o) => {
                    const idx = ORDER_STATUS_STEPS.findIndex((st) => st.key === s);
                    const nextStep = ORDER_STATUS_STEPS[idx + 1]?.key as OrderStatus | undefined;
                    const priced = o.items.filter((it) => it.unit_price != null);
                    const orderTotal = priced.reduce(
                      (n, it) => n + (it.unit_price ?? 0) * it.quantity,
                      0,
                    );
                    return (
                      <div key={o.id} className="glass rounded-2xl p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-xs font-semibold">{o.id}</div>
                          {/* requested_window is only ever set when the customer explicitly
                              scheduled ahead -- requested_date alone defaults to today for
                              every order, so it's not shown here on its own to avoid noise. */}
                          {o.requested_window && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                              {o.requested_date} · {o.requested_window}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm font-semibold">{o.customer?.name}</div>
                        <a
                          href={`tel:${o.customer?.phone ?? ""}`}
                          className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--text-secondary)]"
                        >
                          <Phone className="h-3 w-3" /> {o.customer?.phone}
                        </a>
                        <div className="mt-1 flex items-start gap-1 text-xs text-[color:var(--text-secondary)]">
                          <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          <span className="line-clamp-2">
                            {o.customer?.address}
                            {o.customer?.landmark ? ` · ${o.customer.landmark}` : ""}
                          </span>
                        </div>
                        {priced.length > 0 && (
                          <div className="mt-1 text-xs font-bold text-[color:var(--accent-primary)]">
                            ₹{orderTotal}
                          </div>
                        )}
                        <ul className="mt-2 space-y-0.5 text-xs">
                          {o.items.map((it, i) => (
                            <li key={i} className="text-[color:var(--text-primary)]">
                              {it.quantity}× {it.item_name}
                              {it.notes ? (
                                <span className="text-[color:var(--text-tertiary)]">
                                  {" "}
                                  — {it.notes}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {nextStep && (
                          <button
                            onClick={() => setStatus(o.id, nextStep)}
                            className="tap-scale mt-2 w-full rounded-full accent-gradient px-3 py-1.5 text-xs font-semibold text-[color:var(--on-accent)]"
                          >
                            Mark {STATUS_COPY[nextStep]?.label ?? nextStep}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

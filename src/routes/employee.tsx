import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  employeeLogin,
  employeeLogout,
  employeeSession,
  listEmployeeOrders,
  updateOrderStatus,
} from "@/lib/api.functions";
import { useEffect, useMemo, useState } from "react";
import { ORDER_STATUS_STEPS, STATUS_COPY, type OrderStatus } from "@/lib/constants";
import { toast } from "sonner";
import { LogOut, RefreshCw, X, Phone, MapPin, Sparkles } from "lucide-react";

export const Route = createFileRoute("/employee")({
  head: () => ({
    meta: [
      { title: "Ops board — MyTown" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeePage,
});

const BOARD_STATUSES: OrderStatus[] = ["received", "confirmed", "arranging", "on_the_way", "completed"];

function EmployeePage() {
  const session = useServerFn(employeeSession);
  const [authed, setAuthed] = useState<null | { name: string }>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    session().then((s) => {
      if (s.signedIn) setAuthed({ name: s.name });
      setChecking(false);
    });
  }, [session]);

  if (checking) {
    return <div className="p-6"><div className="skeleton h-40 rounded-2xl" /></div>;
  }
  if (!authed) return <PinGate onIn={(name) => setAuthed({ name })} />;
  return <Board name={authed.name} onOut={() => setAuthed(null)} />;
}

function PinGate({ onIn }: { onIn: (name: string) => void }) {
  const login = useServerFn(employeeLogin);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login({ data: { pin } });
      if (res.ok) onIn(res.name);
      else toast.error("Wrong PIN");
    } catch {
      toast.error("Couldn't sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center p-6">
      <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-6">
        <div>
          <div className="text-display text-2xl font-bold">Ops board</div>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Enter your employee PIN to continue.
          </p>
        </div>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          className="w-full rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] py-3 text-center text-2xl tracking-[0.5em] focus:border-[color:var(--accent-primary)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={pin.length < 4 || busy}
          className="tap-scale w-full rounded-full accent-gradient py-3 font-semibold disabled:opacity-60"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function Board({ name, onOut }: { name: string; onOut: () => void }) {
  const list = useServerFn(listEmployeeOrders);
  const update = useServerFn(updateOrderStatus);
  const logout = useServerFn(employeeLogout);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof list>>["orders"]>([]);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<null | Awaited<ReturnType<typeof list>>["orders"][number]>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await list();
      setOrders(r.orders);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, typeof orders> = {};
    for (const s of BOARD_STATUSES) g[s] = [];
    for (const o of orders) {
      if ((BOARD_STATUSES as string[]).includes(o.status)) g[o.status].push(o);
    }
    return g;
  }, [orders]);

  async function changeStatus(orderId: string, status: OrderStatus) {
    try {
      await update({ data: { orderId, status } });
      toast.success(`Marked ${STATUS_COPY[status].label}`);
      setFocus(null);
      refresh();
    } catch {
      toast.error("Couldn't update");
    }
  }

  return (
    <div className="min-h-[100dvh] w-full">
      <header className="glass sticky top-0 z-30 flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-display text-lg font-semibold">Ops board</div>
          <div className="text-xs text-[color:var(--text-muted)]">Signed in as {name}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} aria-label="Refresh" className="tap-scale rounded-full p-2 hover:bg-white/5">
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => logout().then(onOut)}
            aria-label="Sign out"
            className="tap-scale rounded-full p-2 hover:bg-white/5"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto p-3">
        {BOARD_STATUSES.map((s) => (
          <div key={s} className="w-[85vw] max-w-[320px] shrink-0 snap-start">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-display text-sm font-semibold">{STATUS_COPY[s].label}</div>
              <span className="rounded-full bg-[color:var(--accent-primary)]/15 px-2 py-0.5 text-[11px] font-bold text-[color:var(--accent-primary)]">
                {grouped[s].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[s].length === 0 && (
                <div className="rounded-2xl border border-dashed border-[color:var(--border-subtle)] p-4 text-center text-xs text-[color:var(--text-muted)]">
                  Nothing here
                </div>
              )}
              {grouped[s].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFocus(o)}
                  className="tap-scale card-surface block w-full p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm font-semibold">{o.id}</div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">
                      {timeAgo(o.created_at)}
                    </div>
                  </div>
                  <div className="mt-1 text-sm font-semibold">{o.customer?.name}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {o.items.length} {o.items.length === 1 ? "item" : "items"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {focus && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFocus(null)}>
          <div className="sheet-in glass w-full max-w-[520px] rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-lg font-semibold">{focus.id}</div>
                <div className="text-xs text-[color:var(--text-muted)]">{new Date(focus.created_at!).toLocaleString()}</div>
              </div>
              <button onClick={() => setFocus(null)} aria-label="Close" className="tap-scale rounded-full p-2 hover:bg-white/5">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="font-semibold">{focus.customer?.name}</div>
              <a href={`tel:${focus.customer?.phone}`} className="flex items-center gap-1.5 text-[color:var(--accent-primary)]"><Phone className="h-3.5 w-3.5" />{focus.customer?.phone}</a>
              <div className="flex items-start gap-1.5 text-[color:var(--text-secondary)]">
                <MapPin className="mt-0.5 h-3.5 w-3.5" />
                <div>{focus.customer?.address}{focus.customer?.landmark ? ` (${focus.customer.landmark})` : ""}</div>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {focus.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-[color:var(--bg-elevated-2)] p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {it.is_freeform && <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent-primary)]" />}
                      <div className="text-sm font-semibold">{it.item_name}</div>
                    </div>
                    {it.notes && <div className="text-xs text-[color:var(--text-muted)]">{it.notes}</div>}
                  </div>
                  <div className="text-sm font-bold">×{it.quantity}</div>
                </li>
              ))}
            </ul>
            {focus.notes && (
              <div className="mt-3 rounded-xl border border-[color:var(--border-subtle)] p-3 text-xs">
                <span className="font-semibold">Note: </span>{focus.notes}
              </div>
            )}
            <div className="mt-4 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Update status</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {BOARD_STATUSES.filter((s) => s !== focus.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStatus(focus.id, s)}
                    className="tap-scale rounded-full border border-[color:var(--border-strong)] py-2 text-xs font-semibold"
                  >
                    {STATUS_COPY[s].label}
                  </button>
                ))}
                <button
                  onClick={() => changeStatus(focus.id, "cancelled")}
                  className="tap-scale col-span-2 rounded-full border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 py-2 text-xs font-semibold text-[color:var(--danger)]"
                >
                  Cancel order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

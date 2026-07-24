import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyOrders } from "@/lib/auth.functions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, CardSkeleton, ErrorState } from "@/components/States";
import { STATUS_COPY, type OrderStatus } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/my-orders")({
  head: () => ({
    meta: [
      { title: "My orders — MyTown" },
      {
        name: "description",
        content: "Your recent MyTown orders, live status, and reorder history.",
      },
      { property: "og:title", content: "My orders — MyTown" },
      { property: "og:description", content: "Your recent MyTown orders and live status." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const fetchOrders = useServerFn(getMyOrders);
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    nav({ to: "/auth", replace: true });
  }

  return (
    <div>
      <AppHeader title="My orders" showCart={false} />
      <div className="px-5 pt-2 pb-24">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-[color:var(--text-secondary)]">Your recent asks</p>
          <button
            onClick={signOut}
            className="tap-scale flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-semibold"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>

        {isLoading && <CardSkeleton count={3} />}
        {error && <ErrorState onRetry={() => refetch()} />}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <EmptyState
            title="No orders yet"
            message="Place your first order and it'll show up here."
            action={
              <button
                onClick={() => nav({ to: "/explore" })}
                className="tap-scale rounded-full accent-gradient px-5 py-2.5 font-semibold text-[color:var(--on-accent)]"
              >
                Browse
              </button>
            }
          />
        )}

        <div className="space-y-3">
          {(data ?? []).map((o) => {
            const status = (o.status ?? "received") as OrderStatus;
            const copy = STATUS_COPY[status] ?? { label: status, blurb: "" };
            return (
              <Link
                to="/order/$orderId"
                params={{ orderId: o.id }}
                key={o.id}
                className="tap-scale block glass rounded-2xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm font-semibold">{o.id}</div>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                    {copy.label}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)] line-clamp-2">
                  {(o.items ?? []).map((i) => `${i.quantity}× ${i.item_name}`).join(", ") || "—"}
                </div>
                {(() => {
                  const priced = (o.items ?? []).filter((i) => i.unit_price != null);
                  if (priced.length === 0) return null;
                  const total = priced.reduce((n, i) => n + (i.unit_price ?? 0) * i.quantity, 0);
                  return (
                    <div className="mt-1 text-xs font-semibold text-[color:var(--accent-primary)]">
                      ₹{total}
                    </div>
                  );
                })()}
                {/* requested_date defaults to today for EVERY order (including plain ASAP
                    ones), so it's not a reliable "this was scheduled" signal on its own.
                    requested_window is only ever set when the customer explicitly used
                    the Schedule toggle (see createOrder) -- that's the real signal. */}
                {o.requested_window && (
                  <div className="mt-2 text-xs text-[color:var(--text-tertiary)]">
                    Scheduled: {o.requested_date} · {o.requested_window}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

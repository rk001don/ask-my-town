import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { trackOrder } from "@/lib/api.functions";
import { ORDER_STATUS_STEPS, STATUS_COPY, type OrderStatus, waLink } from "@/lib/constants";
import { Check, MessageCircle, Sparkles } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/States";
import { NotifyMeButton } from "@/components/NotifyMeButton";
import { getOrderTotals } from "@/lib/serviceFee";

const opts = (orderId: string) =>
  queryOptions({
    queryKey: ["order", orderId],
    queryFn: () => trackOrder({ data: { orderId } }),
  });

export const Route = createFileRoute("/order/$orderId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.orderId)),
  head: ({ params }) => ({
    meta: [{ title: `Order ${params.orderId} — MyTown` }, { name: "robots", content: "noindex" }],
  }),
  component: Confirmation,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

function Confirmation() {
  const { orderId } = Route.useParams();
  const { data } = useSuspenseQuery(opts(orderId));
  const order = data.orders[0];

  if (!order) {
    return (
      <div>
        <AppHeader title="Order" showCart={false} />
        <EmptyState
          title="Order not found"
          message="We can't find that order. Check the ID and try again."
        />
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const isCancelled = status === "cancelled";
  const currentIdx = ORDER_STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div>
      <AppHeader
        title={isCancelled ? "Cancelled" : STATUS_COPY[status]?.label ?? "Order"}
        showCart={false}
        showBack={false}
      />
      <div className="rise space-y-5 p-4">
        {/* Hero: reflects the order's real state, not a fixed "confirmed" */}
        <div className="card-surface gradient-hero relative overflow-hidden p-5">
          <div
            className="absolute -right-10 -top-10 h-40 w-40 rounded-full"
            style={{
              background: isCancelled
                ? "radial-gradient(circle, oklch(0.65 0.2 25 / 0.3), transparent 65%)"
                : "radial-gradient(circle, oklch(0.78 0.15 155 / 0.35), transparent 65%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
                isCancelled
                  ? "border-[color:var(--danger)]/40 bg-[color:var(--danger)]/20"
                  : "border-[color:var(--success)]/40 bg-[color:var(--success)]/20"
              }`}
            >
              {isCancelled ? (
                <XCircle className="h-6 w-6 text-[color:var(--danger)]" strokeWidth={2.5} />
              ) : (
                <Check className="h-6 w-6 text-[color:var(--success)]" strokeWidth={2.5} />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-display text-xl font-semibold">
                {isCancelled ? "Order cancelled" : "MyTown got it"}
              </div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {STATUS_COPY[status]?.blurb ??
                  "Our team will call or WhatsApp you to confirm shortly."}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-full border border-[color:var(--border-strong)] bg-black/25 px-3 py-1.5 text-[13px] font-mono font-semibold tracking-wide">
                  {orderId}
                </div>
                {/* Window label only, deliberately no time — requested_date
                    defaults to today for every order (including plain ASAP
                    ones), so it's not shown here on its own; requested_window
                    is only ever set for an explicitly scheduled order. */}
                {!isCancelled && order.requested_window && (
                  <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold capitalize">
                    Scheduled: {order.requested_window}
                  </div>
                )}
              </div>
              {!isCancelled && (
                <div className="mt-3">
                  <NotifyMeButton orderId={orderId} />
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Timeline */}
        <div className="card-surface p-4">
          <h3 className="text-display text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            What happens next
          </h3>
          <ol className="mt-3 space-y-3">
            {ORDER_STATUS_STEPS.map((s, i) => {
              const done = i <= currentIdx;
              const active = i === currentIdx;
              return (
                <li key={s.key} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${done ? "accent-gradient" : "border border-[color:var(--border-strong)] text-[color:var(--text-muted)]"}`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div>
                    <div
                      className={`text-sm font-semibold ${active ? "text-[color:var(--accent-primary)]" : done ? "" : "text-[color:var(--text-muted)]"}`}
                    >
                      {s.label}
                    </div>
                    <div className="text-xs text-[color:var(--text-secondary)]">
                      {STATUS_COPY[s.key as OrderStatus].blurb}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Items summary */}
        <div className="card-surface p-4">
          <h3 className="text-display text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            You asked for
          </h3>
          <ul className="mt-3 space-y-2">
            {order.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {it.is_freeform && (
                      <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent-primary)]" />
                    )}
                    <div className="text-[14px] font-semibold">{it.item_name}</div>
                  </div>
                  {it.notes && (
                    <div className="text-xs text-[color:var(--text-secondary)]">{it.notes}</div>
                  )}
                  {it.unit_price != null && (
                    <div className="text-xs text-[color:var(--text-muted)]">
                      ₹{it.unit_price} each
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[color:var(--text-secondary)]">
                    ×{it.quantity}
                  </div>
                  {it.unit_price != null && (
                    <div className="text-xs font-semibold text-[color:var(--accent-primary)]">
                      ₹{it.unit_price * it.quantity}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {order.items.some((it) => it.unit_price != null) && (
            <div className="mt-3 space-y-2 border-t border-[color:var(--border-subtle)] pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[color:var(--text-secondary)]">Items</span>
                <span className="font-semibold">
                  ₹{getOrderTotals(order.items, order.service_fee_estimate ?? null).subtotal}
                </span>
              </div>
              {order.service_fee_estimate != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[color:var(--text-secondary)]">Service fee</span>
                  <span className="font-semibold">₹{order.service_fee_estimate}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-base font-bold">
                  ₹{getOrderTotals(order.items, order.service_fee_estimate ?? null).total}
                </span>
              </div>
            </div>
          )}
        </div>

        {order.cancellation_reason && (
          <div className="card-surface p-4">
            <h3 className="text-display text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Cancellation note
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{order.cancellation_reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={waLink(`Hi MyTown, this is about order ${orderId}.`)}
            target="_blank"
            rel="noreferrer noopener"
            className="tap-scale flex items-center justify-center gap-1.5 rounded-full accent-gradient py-3 text-sm font-semibold"
          >
            <MessageCircle className="h-4 w-4" /> Chat with us
          </a>
          <Link
            to="/activity"
            className="tap-scale flex items-center justify-center rounded-full border border-[color:var(--border-strong)] py-3 text-sm font-semibold"
          >
            Track order
          </Link>
        </div>
        <Link
          to="/"
          className="tap-scale block rounded-full border border-[color:var(--border-strong)] py-3 text-center text-sm font-semibold"
        >
          Ask again
        </Link>
      </div>
    </div>
  );
}

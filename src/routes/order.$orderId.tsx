import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { trackOrder } from "@/lib/api.functions";
import {
  CUSTOMER_ORDER_STEPS,
  DELIVERY_ETA_LABEL,
  STATUS_COPY,
  customerFacingStatus,
  type OrderStatus,
  waLink,
} from "@/lib/constants";
import {
  BadgeCheck,
  Check,
  Clock,
  MessageCircle,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { EmptyState, ErrorState } from "@/components/States";
import { NotifyMeButton } from "@/components/NotifyMeButton";
import { getOrderTotals } from "@/lib/serviceFee";
import { addCatalogItem, addFreeformAsk } from "@/lib/cart-store";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

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
  // Hooks must run unconditionally: the "order not found" branch below returns
  // early, so anything hook-based has to be called before it.
  const navigate = useNavigate();
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
  // A delivered order used to show the same "MyTown got it" headline as a
  // brand-new one -- the emotional peak of the whole product reduced to a
  // label change. It gets its own state.
  const isDelivered = status === "completed";

  /**
   * Rebuilds this order in the cart.
   *
   * Quantities are replayed rather than adding one of each -- someone who
   * ordered four idlis last week almost certainly wants four again, and making
   * them tap "+" three times is exactly the kind of friction reordering is
   * meant to remove. Freeform asks are re-added as asks, since there's no
   * catalogue product behind them to price.
   */
  function reorder() {
    for (const it of order.items) {
      if (it.is_freeform) {
        addFreeformAsk(it.item_name);
        continue;
      }
      for (let n = 0; n < (it.quantity ?? 1); n++) {
        addCatalogItem({
          itemName: it.item_name,
          category: it.category ?? undefined,
          subcategory: it.subcategory ?? undefined,
          unitPrice: it.unit_price,
          showPrice: it.unit_price != null,
        });
      }
    }
    toast.success("Added to your cart");
    navigate({ to: "/cart" });
  }
  const itemCount = order.items.reduce((n, it) => n + (it.quantity ?? 1), 0);
  // Day and month only: "Delivered 17 Aug" is what a customer wants to
  // recognise the order by. A timestamp to the minute is receipt detail.
  const deliveredOn = order.completed_at
    ? new Date(order.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;
  const currentIdx = CUSTOMER_ORDER_STEPS.findIndex((s) => s.key === customerFacingStatus(status));

  return (
    <div>
      <AppHeader
        title={isCancelled ? "Cancelled" : (STATUS_COPY[status]?.label ?? "Order")}
        showCart={false}
        showBack={false}
      />
      <div className="rise space-y-5 p-4">
        {/* Delivered gets its own hero rather than the tracking hero with a
            tick bolted on. This is the one screen a customer reaches after a
            good experience, so it's centred, states the outcome plainly, and
            puts the only useful next action -- reordering -- directly under
            it. Restrained on purpose: it replays every time a past order is
            reopened, so confetti would wear out fast. */}
        {isDelivered ? (
          <div className="card-surface gradient-hero relative overflow-hidden p-6 text-center">
            <div className="success-halo absolute -right-10 -top-10 h-40 w-40 rounded-full" />
            <div className="relative flex flex-col items-center">
              <div
                className="relative grid h-16 w-16 place-items-center rounded-full border"
                style={{
                  borderColor: "color-mix(in oklab, var(--success) 40%, transparent)",
                  background: "color-mix(in oklab, var(--success) 18%, transparent)",
                }}
              >
                <span className="ring-out absolute inset-0 rounded-full border-2 border-[color:var(--success)]" />
                <BadgeCheck
                  className="tick-in h-9 w-9 text-[color:var(--success)]"
                  strokeWidth={2.2}
                />
              </div>
              <div className="text-display mt-3 text-2xl font-bold">Delivered</div>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {order.customer?.name
                  ? `Thanks, ${order.customer.name.split(" ")[0]} — hope it was all good.`
                  : "Thanks for ordering with MyTown."}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[color:var(--border-strong)] surface-muted px-3 py-1.5 font-mono text-[13px] font-semibold tracking-wide">
                  {orderId}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold"
                  style={{
                    background: "color-mix(in oklab, var(--success) 16%, transparent)",
                    color: "var(--success)",
                  }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  {deliveredOn ? `Delivered ${deliveredOn}` : "Delivered"}
                </span>
                <span className="inline-flex items-center rounded-full border border-[color:var(--border-strong)] surface-muted px-3 py-1.5 text-[13px] font-semibold">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
              </div>
              <button
                onClick={reorder}
                className="tap-scale accent-gradient mt-5 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold"
              >
                <RotateCcw className="h-4 w-4" />
                Order this again
              </button>
            </div>
          </div>
        ) : (
          /* Hero: reflects the order's real state, not a fixed "confirmed" */
          <div className="card-surface gradient-hero relative overflow-hidden p-5">
            <div
              className={`${isCancelled ? "danger-halo" : "success-halo"} absolute -right-10 -top-10 h-40 w-40 rounded-full`}
            />
            <div className="relative flex items-start gap-3">
              <div
                className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
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
                  <div className="inline-flex items-center rounded-full border border-[color:var(--border-strong)] surface-muted px-3 py-1.5 text-[13px] font-mono font-semibold tracking-wide">
                    {orderId}
                  </div>
                  {/* Window label only, deliberately no time — requested_date
                    defaults to today for every order (including plain ASAP
                    ones), so it's not shown here on its own; requested_window
                    is only ever set for an explicitly scheduled order. */}
                  {!isCancelled && order.requested_window && (
                    <div className="inline-flex items-center rounded-full surface-muted px-3 py-1.5 text-[13px] font-semibold capitalize">
                      Scheduled: {order.requested_window}
                    </div>
                  )}
                  {/* "completed" is no longer possible here -- delivered
                      orders render their own hero above. */}
                  {!isCancelled && !order.requested_window && status !== "received" && (
                    <div className="inline-flex items-center gap-1.5 rounded-full surface-muted px-3 py-1.5 text-[13px] font-semibold text-[color:var(--text-secondary)]">
                      <Clock className="h-3.5 w-3.5" />
                      {DELIVERY_ETA_LABEL}
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
        )}

        {/* Timeline — irrelevant once an order is cancelled */}
        {!isCancelled && (
          <div className="card-surface p-4">
            <h3 className="text-display text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              What happens next
            </h3>
            <ol className="mt-3 space-y-3">
              {CUSTOMER_ORDER_STEPS.map((s, i) => {
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
        )}

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

        {isCancelled && order.cancellation_reason && (
          <div className="card-surface p-4">
            <h3 className="text-display text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Cancellation note
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              {order.cancellation_reason}
            </p>
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

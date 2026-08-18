import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { submitOrderRating, trackOrder } from "@/lib/api.functions";
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
  Star,
  XCircle,
} from "lucide-react";
import { EmptyState, ErrorState } from "@/components/States";
import { NotifyMeButton } from "@/components/NotifyMeButton";
import { getOrderTotals } from "@/lib/serviceFee";
import { addCatalogItem, addFreeformAsk } from "@/lib/cart-store";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

// One line per score, in the same voice as the rest of the order page ("We
// got your ask -- our team is on it.") rather than generic "Thanks!" filler.
// A low score gets something that sounds like it was actually read, not a
// canned response identical to a five-star one.
const RATING_THANKS: Record<number, string> = {
  1: "Sorry it wasn't good. We'll do better next time.",
  2: "Sorry to hear that. We're on it.",
  3: "Thanks for letting us know.",
  4: "Glad it went well!",
  5: "Woohoo! So glad you loved it.",
};

const opts = (orderId: string) =>
  queryOptions({
    queryKey: ["order", orderId],
    queryFn: () => trackOrder({ data: { orderId } }),
  });

export const Route = createFileRoute("/order/$orderId")({
  // `placed` is set only by the checkout success navigation. It is the one
  // case where "back" must NOT retrace history: the entry below this page is
  // the cart, now emptied, so back would land on an empty-cart screen right
  // after a successful order. Every other way in -- the Orders list, a shared
  // link -- wants the natural immediate-previous, which is what an undefined
  // backTo gives (AppHeader falls through to history.back()).
  //
  // The placed case doesn't go Home either: right after ordering, "back" is
  // expected to land on the Orders list -- the order you just placed, in its
  // natural context -- not the front door of the app.
  validateSearch: (search: Record<string, unknown>): { placed?: boolean } =>
    search.placed === true || search.placed === "true" ? { placed: true } : {},
  loader: ({ context, params }) => context.queryClient.ensureQueryData(opts(params.orderId)),
  head: ({ params }) => ({
    meta: [{ title: `Order ${params.orderId} — MyTown` }, { name: "robots", content: "noindex" }],
  }),
  component: Confirmation,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

function Confirmation() {
  const { orderId } = Route.useParams();
  const { placed } = Route.useSearch();
  // See validateSearch: the Orders list right after placing; otherwise natural back.
  const backTo = placed ? "/activity" : undefined;
  const { data } = useSuspenseQuery(opts(orderId));
  // Hooks must run unconditionally: the "order not found" branch below returns
  // early, so anything hook-based has to be called before it.
  const navigate = useNavigate();
  const rateFn = useServerFn(submitOrderRating);
  const order = data.orders[0];
  // Optimistic only -- set the moment a star is tapped, before the request
  // resolves, so the tap feels instant. Falls back to the order's own value
  // (from a previous visit) until then.
  const [optimisticRating, setOptimisticRating] = useState<number | null>(null);

  if (!order) {
    return (
      <div>
        <AppHeader title="Order" showCart={false} backTo={backTo} />
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

  const displayedRating = optimisticRating ?? order.rating ?? null;

  /**
   * One tap, no confirm step -- Swiggy/Zomato both skip a "submit" button for
   * exactly this because a star rating is already the whole interaction; a
   * second tap to confirm it would just be friction with no new information.
   * Tapping a different star re-sends and overwrites, so changing your mind
   * costs nothing.
   */
  async function rate(n: number) {
    setOptimisticRating(n);
    try {
      await rateFn({ data: { orderId, rating: n } });
    } catch {
      setOptimisticRating(null); // the stars settle back to whatever's true
      toast.error("Couldn't save your rating. Please try again.");
    }
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
        backTo={backTo}
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
                {order.contact_name
                  ? `Thanks, ${order.contact_name.split(" ")[0]} — hope it was all good.`
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
              <div className="mt-5 flex flex-col items-center gap-1.5">
                <div className="text-xs font-semibold text-[color:var(--text-secondary)]">
                  {displayedRating ? "Your rating" : "How was it?"}
                </div>
                {/* `key` forces a remount -- and so a fresh play of badge-bounce --
                    every time the rating actually changes, but not on the
                    read-only first paint of a rating from a previous visit,
                    which would just be a distracting flash on a page someone
                    is reopening to check on, not interacting with. */}
                <div key={displayedRating ?? "unrated"} className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => rate(n)}
                      aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                      className="tap-scale grid h-11 w-11 place-items-center"
                    >
                      <Star
                        // Gold (--warning), not the app's own orange accent --
                        // a star rating is a universally recognised affordance
                        // in its own right and reads better distinct from
                        // "just another accent-coloured button" on the page.
                        // Each filled star pops slightly after the one before
                        // it -- a left-to-right wave, not five stars blinking
                        // on at once -- matching the fill animation Swiggy and
                        // Zomato both use.
                        className={`h-8 w-8 ${displayedRating && n <= displayedRating ? "badge-bounce" : ""}`}
                        strokeWidth={2}
                        style={
                          displayedRating && n <= displayedRating
                            ? {
                                fill: "var(--warning)",
                                color: "var(--warning)",
                                animationDelay: `${(n - 1) * 60}ms`,
                              }
                            : { color: "var(--border-strong)" }
                        }
                      />
                    </button>
                  ))}
                </div>
                {displayedRating && (
                  <p className="rise text-xs text-[color:var(--text-secondary)]">
                    {RATING_THANKS[displayedRating]}
                  </p>
                )}
              </div>
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
        {/* Secondary, matching "Track order". A second full-width accent
            button competed with "Chat with us" and made the page read as if
            it wanted you to order again immediately -- this is just the way
            back to browsing.

            Kept even when delivered: "Order this again" in the hero replays
            THIS order, but there's no other one-tap way off this page to
            browse something different -- that's still what this is for. */}
        <Link
          to="/"
          className="tap-scale flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--border-strong)] py-3 text-center text-sm font-semibold"
        >
          <Sparkles className="h-4 w-4" />
          Ask again
        </Link>
      </div>
    </div>
  );
}

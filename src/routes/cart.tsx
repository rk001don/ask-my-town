import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/States";
import { useCart, decrementItem, incrementItem, removeItem, setItemNotes } from "@/lib/cart-store";
import { ArrowRight, Minus, Plus, ShoppingBag, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { iconFor } from "@/components/icon-map";
import { ServiceFeeBreakdown } from "@/components/ServiceFeeBreakdown";
import { useState } from "react";
import { placeholderGradientFor } from "@/lib/catalog-display";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Review your ask — MyTown" },
      {
        name: "description",
        content: "Review what you're asking MyTown for. Add notes, tweak quantity, then continue.",
      },
    ],
  }),
  component: Cart,
});

function Cart() {
  const { items } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div>
        <AppHeader title="Your ask" />
        <EmptyState
          title="Nothing here yet"
          message="Browse categories or ask us directly — we'll take care of it."
          action={
            <Link
              to="/explore"
              className="tap-scale rounded-full border border-[color:var(--border-strong)] px-5 py-2.5 text-sm font-semibold"
            >
              Browse
            </Link>
          }
        />
      </div>
    );
  }

  const priceableItems = items.filter((i) => i.showPrice && i.unitPrice != null);
  const subtotal = priceableItems.reduce((n, i) => n + (i.unitPrice ?? 0) * i.quantity, 0);
  const hasUnpricedItems = items.some((i) => !i.showPrice || i.unitPrice == null);
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div>
      <AppHeader title="Your ask" />
      <div className="px-4 pt-3">
        <div className="rise grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-[color:var(--bg-elevated)] p-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[color:var(--accent-primary)]/15 text-[color:var(--accent-primary)]">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Your order</div>
            <div className="truncate text-xs text-[color:var(--text-secondary)]">
              {itemCount} {itemCount === 1 ? "item" : "items"} · Review quantities and notes
            </div>
          </div>
        </div>
      </div>
      <ul className="space-y-3 p-4">
        {items.map((it) => (
          <CartRow key={it.key} it={it} />
        ))}
      </ul>

      {priceableItems.length > 0 && (
        <div className="px-4 pb-2">
          <ServiceFeeBreakdown subtotal={subtotal} />
        </div>
      )}

      <div className="px-4 pb-4">
        <div className="card-surface flex items-start gap-3 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent-primary)]" />
          <p className="text-sm text-[color:var(--text-secondary)]">
            {hasUnpricedItems
              ? "Some items are priced on request — we'll call or WhatsApp you to confirm those before doing anything. Pay on delivery."
              : "You'll pay the total above on delivery. We'll call or WhatsApp you to confirm availability first."}
          </p>
        </div>
      </div>

      <div
        className="glass fixed inset-x-0 bottom-0 z-[var(--z-header)] border-t border-[color:var(--border-subtle)] p-4 md:left-56"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-[520px] md:max-w-2xl">
          <button
            type="button"
            onClick={() => navigate({ to: "/checkout" })}
            className="tap-scale flex min-h-12 w-full items-center justify-center gap-2 rounded-xl accent-gradient px-4 py-3.5 text-[15px] font-bold"
          >
            Continue to delivery <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="h-24" />
    </div>
  );
}

function CartRow({ it }: { it: ReturnType<typeof useCart>["items"][number] }) {
  const [showNotes, setShowNotes] = useState(!!it.notes);
  const [notes, setNotes] = useState(it.notes ?? "");
  const Icon = iconFor(it.iconKey);

  return (
    <li className="card-surface p-3">
      <div className="flex gap-3">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-xl"
          style={{
            // Same per-item placeholder colour the catalogue uses, so a dish
            // looks like itself from grid to cart instead of changing colour
            // on the way. Freeform asks aren't catalogue items, so they keep
            // the distinct accent wash that marks them as "you told us this".
            background: it.isFreeform
              ? "linear-gradient(140deg, color-mix(in oklab, var(--accent-primary) 34%, transparent), color-mix(in oklab, var(--accent-secondary) 32%, transparent))"
              : placeholderGradientFor(it.itemName),
          }}
        >
          {it.isFreeform ? (
            <Sparkles className="h-6 w-6 text-white" />
          ) : (
            <Icon className="h-6 w-6 text-[color:var(--accent-primary)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {it.isFreeform && (
                <div className="mb-0.5 inline-block rounded-full bg-[color:var(--accent-primary)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--accent-primary)]">
                  You asked
                </div>
              )}
              <div className="line-clamp-2 break-words text-[14px] font-semibold leading-tight">
                {it.itemName}
              </div>
              {!it.isFreeform && it.category && (
                <div className="text-[11px] text-[color:var(--text-muted)]">{it.category}</div>
              )}
              {!it.isFreeform && (
                <div
                  className={
                    it.showPrice && it.unitPrice != null
                      ? "mt-0.5 text-[13px] font-bold text-[color:var(--accent-primary)]"
                      : "mt-0.5 text-[12px] font-medium text-[color:var(--text-muted)]"
                  }
                >
                  {it.showPrice && it.unitPrice != null ? `₹${it.unitPrice}` : "Price on request"}
                </div>
              )}
            </div>
            <button
              onClick={() => removeItem(it.key)}
              aria-label="Remove"
              className="tap-scale grid h-9 w-9 place-items-center rounded-full text-[color:var(--text-muted)] hover:text-[color:var(--danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="tap-scale inline-flex items-center gap-1 text-xs text-[color:var(--text-secondary)]"
            >
              <StickyNote className="h-3.5 w-3.5" />
              {notes ? "Edit note" : "Add note"}
            </button>
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] px-1">
              {it.isService ? (
                <span className="px-2 py-1.5 text-xs font-semibold text-[color:var(--text-secondary)]">
                  1 booking
                </span>
              ) : (
                <>
                  <button
                    onClick={() => decrementItem(it.key)}
                    aria-label="Decrease"
                    className="tap-scale grid h-9 w-9 place-items-center"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[1.5rem] text-center text-sm font-bold">
                    {it.quantity}
                  </span>
                  <button
                    onClick={() => incrementItem(it.key)}
                    aria-label="Increase"
                    className="tap-scale grid h-9 w-9 place-items-center"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {showNotes && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => setItemNotes(it.key, notes)}
              maxLength={200}
              rows={2}
              placeholder="Any specifics (brand, size…)"
              className="mt-2 w-full resize-none rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-2 text-[12px] placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-primary)] focus:outline-none"
            />
          )}
        </div>
      </div>
    </li>
  );
}

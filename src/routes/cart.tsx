import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/States";
import {
  useCart,
  decrementItem,
  incrementItem,
  removeItem,
  setItemNotes,
} from "@/lib/cart-store";
import { Minus, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { iconFor } from "@/components/icon-map";
import { useState } from "react";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Review your ask — MyTown" },
      { name: "description", content: "Review what you're asking MyTown for. Add notes, tweak quantity, then continue." },
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

  const total = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div>
      <AppHeader title="Your ask" />
      <div className="px-4 pt-2">
        <div className="rise text-sm text-[color:var(--text-secondary)]">
          <span className="text-[color:var(--accent-primary)] font-semibold">{total}</span>{" "}
          {total === 1 ? "item" : "items"} added
        </div>
      </div>
      <ul className="space-y-3 p-4">
        {items.map((it) => (
          <CartRow key={it.key} it={it} />
        ))}
      </ul>

      <div className="px-4 pb-4">
        <div className="card-surface flex items-start gap-3 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent-primary)]" />
          <p className="text-sm text-[color:var(--text-secondary)]">
            We'll confirm price & availability on WhatsApp before doing anything. Pay on delivery.
          </p>
        </div>
      </div>

      <div
        className="glass fixed bottom-0 left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 border-t border-[color:var(--border-subtle)] p-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => navigate({ to: "/checkout" })}
          className="tap-scale w-full rounded-full accent-gradient py-3.5 text-[15px] font-bold"
        >
          Continue
        </button>
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
            background: it.isFreeform
              ? "linear-gradient(140deg, oklch(0.82 0.16 70 / 0.35), oklch(0.72 0.19 30 / 0.35))"
              : "linear-gradient(140deg, oklch(0.82 0.16 70 / 0.18), oklch(0.72 0.19 30 / 0.16))",
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
              <div className="line-clamp-2 text-[14px] font-semibold leading-tight">
                {it.itemName}
              </div>
              {!it.isFreeform && it.category && (
                <div className="text-[11px] text-[color:var(--text-muted)]">{it.category}</div>
              )}
            </div>
            <button
              onClick={() => removeItem(it.key)}
              aria-label="Remove"
              className="tap-scale rounded-full p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--danger)]"
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
              <button onClick={() => decrementItem(it.key)} aria-label="Decrease" className="tap-scale grid h-8 w-8 place-items-center">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.5rem] text-center text-sm font-bold">{it.quantity}</span>
              <button onClick={() => incrementItem(it.key)} aria-label="Increase" className="tap-scale grid h-8 w-8 place-items-center">
                <Plus className="h-4 w-4" />
              </button>
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

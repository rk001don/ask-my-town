import { useEffect, useRef } from "react";
import { Minus, Plus, Sparkles, X } from "lucide-react";
import { catalogVisualFor } from "@/lib/catalog-display";
import {
  addCatalogItem,
  decrementItem,
  incrementItem,
  productKeyFor,
  useProductQuantity,
} from "@/lib/cart-store";
import { openAskSheet } from "./AskFAB";
import type { ProductRow } from "./ProductCard";

/**
 * Full product detail, opened by tapping a card.
 *
 * Bottom sheet on mobile, centred panel from `sm:` up -- the same component
 * either way, because the content is identical and only the framing differs.
 *
 * This exists mainly for the assistance services: "Parent Assistance" as a
 * bare title tells a customer nothing about what would actually happen, so
 * there was no way to decide whether to order it. Food benefits too, but the
 * services are the reason.
 */
export function ProductSheet({
  product,
  categoryName,
  categoryIcon,
  onClose,
}: {
  product: ProductRow & { description_long?: string | null };
  categoryName?: string;
  categoryIcon?: string | null;
  onClose: () => void;
}) {
  const qty = useProductQuantity(product.id);
  const key = productKeyFor(product.id);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const visual = catalogVisualFor(
    product.name,
    categoryName,
    categoryIcon ?? product.categories?.icon_key,
  );
  const VisualIcon = visual.Icon;

  const hasPrice = product.show_price && product.price != null;
  const priceLabel = hasPrice ? `₹${Number(product.price).toFixed(0)}` : "Price on request";
  const body = product.description_long?.trim() || product.description?.trim() || null;

  // Escape closes, and the page behind must not scroll while this is open --
  // without the lock, flicking the sheet scrolls the catalogue underneath it.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-3xl bg-[color:var(--bg-elevated)] sm:rounded-3xl"
      >
        <div className="relative shrink-0">
          <div
            className="grid aspect-[16/10] w-full place-items-center overflow-hidden"
            style={product.image_url ? undefined : { background: visual.gradient }}
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
                decoding="async"
              />
            ) : (
              <VisualIcon className="h-12 w-12 text-white/40" strokeWidth={1.4} />
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="tap-scale absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          {product.is_veg != null && (
            <span
              aria-label={product.is_veg ? "Veg" : "Non-veg"}
              className="mb-2 grid h-4 w-4 place-items-center rounded-[3px] border-[1.5px]"
              style={{ borderColor: product.is_veg ? "var(--success)" : "var(--danger)" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: product.is_veg ? "var(--success)" : "var(--danger)" }}
              />
            </span>
          )}
          <h2 className="text-display text-[22px] font-bold leading-tight">{product.name}</h2>
          {categoryName && (
            <div className="mt-0.5 text-[13px] text-[color:var(--text-muted)]">{categoryName}</div>
          )}

          {body ? (
            <div className="mt-3 space-y-3">
              {body.split(/\n\s*\n/).map((para, i) => (
                <p
                  key={i}
                  className="text-[14px] leading-relaxed text-[color:var(--text-secondary)]"
                >
                  {para.trim()}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[14px] text-[color:var(--text-secondary)]">
              Tap add and we'll confirm the details with you on call.
            </p>
          )}

          {!hasPrice && (
            <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--border-strong)] p-3 text-[13px] text-[color:var(--text-secondary)]">
              We'll confirm the price with you before doing anything. Nothing is charged until you
              agree.
            </div>
          )}

          <button
            onClick={() => {
              onClose();
              openAskSheet(`About "${product.name}": `);
            }}
            className="tap-scale mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--accent-primary)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask a question about this
          </button>
        </div>

        <div
          className="shrink-0 border-t border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] px-5 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div
              className={
                hasPrice
                  ? "text-[19px] font-extrabold text-[color:var(--accent-primary)]"
                  : "text-[13px] font-medium text-[color:var(--text-muted)]"
              }
            >
              {priceLabel}
            </div>
            {qty === 0 ? (
              <button
                onClick={() =>
                  addCatalogItem({
                    itemName: product.name,
                    category: categoryName,
                    subcategory: product.tags?.[0],
                    productId: product.id,
                    unitPrice: product.price,
                    showPrice: product.show_price,
                    isService: product.is_service,
                    iconKey: categoryIcon ?? product.categories?.icon_key ?? undefined,
                  })
                }
                className="tap-scale accent-gradient rounded-full px-7 py-2.5 text-[15px] font-bold"
              >
                {product.is_service ? "Ask for this" : "Add to cart"}
              </button>
            ) : (
              <div className="flex items-center rounded-full border border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]/10">
                <button
                  onClick={() => decrementItem(key)}
                  aria-label="Decrease"
                  className="tap-scale grid h-10 w-11 place-items-center text-[color:var(--accent-primary)]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[24px] text-center text-[15px] font-bold text-[color:var(--accent-primary)]">
                  {qty}
                </span>
                <button
                  onClick={() => incrementItem(key)}
                  aria-label="Increase"
                  className="tap-scale grid h-10 w-11 place-items-center text-[color:var(--accent-primary)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

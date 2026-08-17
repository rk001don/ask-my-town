import { Minus, Plus, Star } from "lucide-react";
import { useState } from "react";
import { catalogVisualFor, type CatalogView } from "@/lib/catalog-display";
import {
  addCatalogItem,
  decrementItem,
  incrementItem,
  productKeyFor,
  useProductQuantity,
} from "@/lib/cart-store";

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  /** Full copy for the detail sheet; falls back to `description` when empty. */
  description_long?: string | null;
  image_url?: string | null;
  price: number | null;
  show_price: boolean;
  is_veg: boolean | null;
  is_service: boolean;
  schedulable: boolean;
  tags: string[];
  categories?: { name: string; icon_key?: string | null } | null;
};

/**
 * Earned from real order counts (see getCategoryBestSellerIds), never set by
 * hand -- so it stays absent until the sales data actually supports the claim.
 */
function BestSellerBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-primary)] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-[color:var(--on-accent)] shadow-sm ${className}`}
    >
      <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
      Bestseller
    </span>
  );
}

export function ProductCard({
  product,
  categoryName,
  categoryIcon,
  view = "list",
  id,
  highlighted = false,
  bestSeller = false,
  onOpen,
}: {
  product: ProductRow;
  categoryName?: string;
  categoryIcon?: string | null;
  view?: CatalogView;
  id?: string;
  highlighted?: boolean;
  /** Top seller in its category over the last 30 days. Earned, never set by hand. */
  bestSeller?: boolean;
  /** Opens the detail sheet. Omit to keep the card non-interactive. */
  onOpen?: (product: ProductRow) => void;
}) {
  const qty = useProductQuantity(product.id);
  const key = productKeyFor(product.id);
  const [imageFailed, setImageFailed] = useState(false);
  const safeImageUrl = product.image_url && !imageFailed ? product.image_url : null;
  const visual = catalogVisualFor(
    product.name,
    categoryName,
    categoryIcon ?? product.categories?.icon_key,
  );
  const VisualIcon = visual.Icon;

  const hasPrice = product.show_price && product.price != null;
  const priceLabel = hasPrice ? `₹${Number(product.price).toFixed(0)}` : "Price on request";

  const image = (
    <div
      className={
        view === "grid"
          ? "relative grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-2xl"
          : "relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl"
      }
      style={safeImageUrl ? undefined : { background: visual.gradient }}
    >
      {safeImageUrl ? (
        <img
          src={safeImageUrl}
          alt={product.name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        // Sized and dimmed to read as "no photo yet" rather than as the
        // card's artwork. The colour comes from --ph-ink, not a fixed white:
        // the light theme's placeholder tiles are pale tints, so a white icon
        // on them was effectively invisible -- which is what made the grid
        // look like a wall of empty tiles in light mode.
        <VisualIcon
          className={view === "grid" ? "h-8 w-8" : "h-6 w-6"}
          style={{ color: "var(--ph-ink)" }}
          strokeWidth={1.5}
        />
      )}
      {/* Grid only. The list thumbnail is 64px and clips its overflow, so the
          same overlay there rendered as a truncated "Bestse..."; in list view
          the badge moves inline beside the name instead. */}
      {bestSeller && view === "grid" && <BestSellerBadge className="absolute left-1.5 top-1.5" />}
    </div>
  );

  // The whole card opens the detail sheet, but the cart controls inside it
  // must not -- so those stop propagation rather than the card using a <button>
  // wrapper, which would nest interactive elements.
  const interactive = !!onOpen;

  return (
    <div
      id={id}
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: () => onOpen(product),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(product);
              }
            },
          }
        : {})}
      className={`scroll-mt-20 ${interactive ? "tap-scale cursor-pointer" : ""} ${
        view === "grid"
          ? "card-surface rise flex h-full min-h-[250px] flex-col gap-3 p-3"
          : "card-surface rise flex items-start gap-3 p-3"
      } ${highlighted ? "ring-2 ring-[color:var(--accent-primary)] transition-shadow duration-500" : ""}`}
    >
      {image}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Veg/non-veg marker sits inline above the dish name, the way every
            Indian food app places it. It used to be a flex sibling of the
            image and the text block, which in grid view (a flex-col card)
            made it claim an entire row of its own between the photo and the
            name, and in list view pushed the text away from the photo. */}
        {product.is_veg != null && (
          <span
            aria-label={product.is_veg ? "Veg" : "Non-veg"}
            title={product.is_veg ? "Veg" : "Non-veg"}
            className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border-[1.5px]"
            style={{ borderColor: product.is_veg ? "var(--success)" : "var(--danger)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: product.is_veg ? "var(--success)" : "var(--danger)" }}
            />
          </span>
        )}
        {bestSeller && view === "list" && <BestSellerBadge className="self-start" />}
        <div className="min-w-0 break-words text-[15px] font-semibold leading-snug">
          {product.name}
        </div>
        {product.description && (
          <p className="line-clamp-2 text-[12px] text-[color:var(--text-secondary)]">
            {product.description}
          </p>
        )}
        <div
          className={`flex items-center justify-between gap-2 ${view === "grid" ? "mt-auto pt-1" : "mt-1"}`}
        >
          <div
            className={
              hasPrice
                ? "text-[15px] font-extrabold text-[color:var(--accent-primary)]"
                : "text-[12px] font-medium text-[color:var(--text-muted)]"
            }
          >
            {priceLabel}
          </div>
          {qty === 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addCatalogItem({
                  itemName: product.name,
                  category: categoryName,
                  subcategory: product.tags?.[0],
                  productId: product.id,
                  unitPrice: product.price,
                  showPrice: product.show_price,
                  isService: product.is_service,
                  iconKey: categoryIcon ?? product.categories?.icon_key ?? undefined,
                });
              }}
              className="tap-scale accent-gradient rounded-full px-5 py-2 text-sm font-bold shadow-[var(--shadow-accent-glow)]"
            >
              {product.is_service ? "Ask" : "Add"}
            </button>
          ) : (
            <div className="flex items-center rounded-full border border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]/10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decrementItem(key);
                }}
                aria-label="Decrease"
                className="tap-scale grid h-9 w-9 place-items-center text-[color:var(--accent-primary)]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[20px] text-center text-sm font-bold text-[color:var(--accent-primary)]">
                {qty}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  incrementItem(key);
                }}
                aria-label="Increase"
                className="tap-scale grid h-9 w-9 place-items-center text-[color:var(--accent-primary)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

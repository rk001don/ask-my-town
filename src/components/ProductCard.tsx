import { Minus, Plus } from "lucide-react";
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
  image_url?: string | null;
  price: number | null;
  show_price: boolean;
  is_veg: boolean | null;
  is_service: boolean;
  schedulable: boolean;
  tags: string[];
  categories?: { name: string; icon_key?: string | null } | null;
};

export function ProductCard({
  product,
  categoryName,
  categoryIcon,
  view = "list",
  id,
  highlighted = false,
}: {
  product: ProductRow;
  categoryName?: string;
  categoryIcon?: string | null;
  view?: CatalogView;
  id?: string;
  highlighted?: boolean;
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
          : "grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl"
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
        // card's artwork. At h-12 and 90% white it was the loudest element on
        // every card, which is what made a grid of placeholder cards look
        // like a repeating pattern instead of a list of dishes.
        <VisualIcon
          className={view === "grid" ? "h-8 w-8 text-white/45" : "h-6 w-6 text-white/45"}
          strokeWidth={1.5}
        />
      )}
    </div>
  );

  return (
    <div
      id={id}
      className={`scroll-mt-20 ${
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
              className="tap-scale rounded-full accent-gradient px-5 py-2 text-sm font-bold shadow-[0_2px_10px_-2px_oklch(0.72_0.19_30_/_0.5)]"
            >
              {product.is_service ? "Ask" : "Add"}
            </button>
          ) : (
            <div className="flex items-center rounded-full border border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]/10">
              <button
                onClick={() => decrementItem(key)}
                aria-label="Decrease"
                className="tap-scale grid h-9 w-9 place-items-center text-[color:var(--accent-primary)]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[20px] text-center text-sm font-bold text-[color:var(--accent-primary)]">
                {qty}
              </span>
              <button
                onClick={() => incrementItem(key)}
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

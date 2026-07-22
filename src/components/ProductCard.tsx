import { Minus, Plus } from "lucide-react";
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
  price: number | null;
  show_price: boolean;
  is_veg: boolean | null;
  is_service: boolean;
  schedulable: boolean;
  tags: string[];
};

export function ProductCard({
  product,
  categoryName,
}: {
  product: ProductRow;
  categoryName?: string;
}) {
  const qty = useProductQuantity(product.id);
  const key = productKeyFor(product.id);

  const priceLabel =
    product.show_price && product.price != null
      ? `₹${Number(product.price).toFixed(0)}`
      : "Price on request";

  return (
    <div className="card-surface rise flex items-start gap-3 p-3">
      {product.is_veg != null && (
        <span
          aria-label={product.is_veg ? "Veg" : "Non-veg"}
          className="mt-1.5 grid h-4 w-4 shrink-0 place-items-center border"
          style={{
            borderColor: product.is_veg ? "#2f9e44" : "#c92a2a",
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: product.is_veg ? "#2f9e44" : "#c92a2a" }}
          />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="min-w-0 text-[14px] font-semibold leading-tight">
          {product.name}
        </div>
        {product.description && (
          <p className="line-clamp-2 text-[12px] text-[color:var(--text-secondary)]">
            {product.description}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-[color:var(--text-primary)]">
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
                })
              }
              className="tap-scale rounded-full accent-gradient px-4 py-1.5 text-sm font-semibold"
            >
              {product.is_service ? "Ask" : "Add"}
            </button>
          ) : (
            <div className="flex items-center rounded-full border border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]/10">
              <button
                onClick={() => decrementItem(key)}
                aria-label="Decrease"
                className="tap-scale grid h-8 w-8 place-items-center text-[color:var(--accent-primary)]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[20px] text-center text-sm font-bold text-[color:var(--accent-primary)]">
                {qty}
              </span>
              <button
                onClick={() => incrementItem(key)}
                aria-label="Increase"
                className="tap-scale grid h-8 w-8 place-items-center text-[color:var(--accent-primary)]"
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

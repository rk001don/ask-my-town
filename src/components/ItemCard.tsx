import { useState } from "react";
import { Minus, Plus, StickyNote } from "lucide-react";
import { iconFor } from "./icon-map";
import {
  addCatalogItem,
  decrementItem,
  incrementItem,
  itemKeyFor,
  setItemNotes,
  useCart,
  useItemQuantity,
} from "@/lib/cart-store";

type Props = {
  itemName: string;
  category?: string;
  subcategory?: string;
  iconKey?: string | null;
  imageUrl?: string | null;
};

export function ItemCard({ itemName, category, subcategory, iconKey, imageUrl }: Props) {
  const qty = useItemQuantity(itemName, subcategory);
  const { items } = useCart();
  const key = itemKeyFor(itemName, subcategory);
  const currentNotes = items.find((i) => i.key === key)?.notes ?? "";
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(currentNotes);
  const Icon = iconFor(iconKey);

  return (
    <div className="card-surface rise flex flex-col overflow-hidden">
      <div
        className="relative flex h-28 items-center justify-center"
        style={
          imageUrl
            ? undefined
            : {
                background:
                  "linear-gradient(150deg, oklch(0.28 0.06 60) 0%, oklch(0.22 0.05 30) 60%, oklch(0.18 0.03 260) 100%)",
              }
        }
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={itemName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Icon className="h-10 w-10 text-white/90" strokeWidth={1.8} />
        )}
        <button
          onClick={() => setShowNotes((v) => !v)}
          aria-label="Add note"
          className="tap-scale absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur-md text-white/80 hover:text-white"
        >
          <StickyNote className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-h-[2.5rem] text-[14px] font-semibold leading-tight line-clamp-2">
          {itemName}
        </div>
        <p className="text-[11px] text-[color:var(--text-muted)]">Price confirmed after you ask</p>
        {showNotes && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => qty > 0 && setItemNotes(key, notes)}
            maxLength={200}
            rows={2}
            placeholder="Add a note (brand, size, etc.)"
            className="mt-1 w-full resize-none rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-2 text-[12px] placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-primary)] focus:outline-none"
          />
        )}
        {qty === 0 ? (
          <button
            onClick={() => {
              addCatalogItem({ itemName, category, subcategory, iconKey: iconKey ?? undefined });
              if (notes.trim()) setItemNotes(itemKeyFor(itemName, subcategory), notes);
            }}
            className="tap-scale mt-auto rounded-full accent-gradient px-4 py-2 text-sm font-semibold"
          >
            Add
          </button>
        ) : (
          <div className="mt-auto flex items-center justify-between rounded-full border border-[color:var(--accent-primary)] bg-[color:var(--accent-primary)]/10 px-1">
            <button
              onClick={() => decrementItem(key)}
              aria-label="Decrease"
              className="tap-scale grid h-9 w-9 place-items-center text-[color:var(--accent-primary)]"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-[color:var(--accent-primary)]">{qty}</span>
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
  );
}

import { Coffee, GlassWater, Pill, Utensils, type LucideIcon } from "lucide-react";
import { iconFor } from "@/components/icon-map";

export type CatalogView = "grid" | "list";

export const CATALOG_VIEW_KEY = "mytown.catalogView";

// One consistent warm placeholder background across every product/category/
// item tile that has no photo -- matches CategoryTile and ItemCard so a
// grid never mixes a rainbow of unrelated placeholder colors.
export const CATALOG_FALLBACK_GRADIENT =
  "linear-gradient(150deg, oklch(0.28 0.06 60) 0%, oklch(0.22 0.05 30) 60%, oklch(0.18 0.03 260) 100%)";

const foodWords = [
  "idli",
  "dosa",
  "poori",
  "pongal",
  "chapati",
  "parotta",
  "rice",
  "noodles",
  "biryani",
  "meals",
  "chicken",
  "fish",
  "puff",
  "cake",
  "snack",
];
const beverageWords = ["juice", "shake", "coca", "pepsi", "milk"];

/**
 * Picks the icon shown on a product's placeholder tile when it has no photo.
 * Falls back to the item's own category icon (same icon_key CategoryTile
 * uses) rather than a generic box, so a category's product grid always
 * reads as visually part of that category.
 */
export function catalogVisualFor(
  name: string,
  categoryName?: string | null,
  categoryIcon?: string | null,
): { Icon: LucideIcon; gradient: string } {
  const key = `${name} ${categoryName ?? ""}`.toLowerCase();
  let Icon: LucideIcon = iconFor(categoryIcon);
  if (key.includes("medicine") || key.includes("band") || key.includes("pad")) {
    Icon = Pill;
  } else if (beverageWords.some((word) => key.includes(word))) {
    Icon = GlassWater;
  } else if (foodWords.some((word) => key.includes(word))) {
    Icon = Utensils;
  } else if (key.includes("coffee") || key.includes("tea")) {
    Icon = Coffee;
  }
  return { Icon, gradient: CATALOG_FALLBACK_GRADIENT };
}

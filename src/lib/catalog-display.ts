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
  return { Icon, gradient: placeholderGradientFor(name) };
}

// Most of the catalogue has no photograph yet, so the placeholder *is* the
// product image for now. Giving every one of them the identical gradient
// turned a grid into wallpaper -- twenty cards that read as one repeating
// texture, which is the main thing that made the catalogue look unfinished
// next to an app like Swiggy.
//
// These eight are all dark, low-chroma and drawn from the app's own warm
// accent range, so a grid stays cohesive; they differ enough for each card to
// register as its own thing. The choice is a hash of the name, so a given
// dish keeps the same colour on every screen it appears on (grid, search,
// cart) instead of changing as it moves around.
const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(150deg, oklch(0.30 0.07 55) 0%, oklch(0.22 0.05 30) 65%, oklch(0.18 0.03 260) 100%)",
  "linear-gradient(150deg, oklch(0.29 0.06 20) 0%, oklch(0.21 0.05 10) 65%, oklch(0.17 0.03 280) 100%)",
  "linear-gradient(150deg, oklch(0.30 0.06 95) 0%, oklch(0.22 0.05 70) 65%, oklch(0.18 0.03 250) 100%)",
  "linear-gradient(150deg, oklch(0.28 0.06 145) 0%, oklch(0.21 0.04 130) 65%, oklch(0.17 0.03 250) 100%)",
  "linear-gradient(150deg, oklch(0.28 0.06 300) 0%, oklch(0.21 0.05 290) 65%, oklch(0.17 0.03 260) 100%)",
  "linear-gradient(150deg, oklch(0.29 0.06 240) 0%, oklch(0.21 0.05 250) 65%, oklch(0.17 0.03 270) 100%)",
  "linear-gradient(150deg, oklch(0.30 0.07 40) 0%, oklch(0.22 0.05 350) 65%, oklch(0.18 0.03 270) 100%)",
  "linear-gradient(150deg, oklch(0.28 0.05 180) 0%, oklch(0.21 0.04 200) 65%, oklch(0.17 0.03 260) 100%)",
];

export function placeholderGradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

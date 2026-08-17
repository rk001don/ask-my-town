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
// turned a grid into wallpaper -- twenty cards reading as one repeating
// texture, which is a large part of why the catalogue looked unfinished.
//
// The eight variants are defined per-theme in styles.css (--ph-0 .. --ph-7)
// rather than here, so the light theme can use soft tints and the dark theme
// deep ones. A single hardcoded set can only suit one ground: it's a dark slab
// on a light card, or a glare on a dark one.
const PLACEHOLDER_COUNT = 8;

/**
 * Picks one of the placeholder tiles for a product with no photo.
 *
 * The choice is a hash of the name so a dish keeps the same tile everywhere it
 * appears -- grid, search, cart -- instead of changing colour as it moves.
 */
export function placeholderGradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `var(--ph-${hash % PLACEHOLDER_COUNT})`;
}

import {
  Coffee,
  GlassWater,
  Hotel,
  PackageCheck,
  Pill,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";

export type CatalogView = "grid" | "list";

export const CATALOG_VIEW_KEY = "mytown.catalogView";

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
const serviceWords = [
  "assistance",
  "booking",
  "pickup",
  "delivery",
  "submission",
  "translation",
  "recharge",
  "anything",
  "guide",
  "queue",
];

export function catalogVisualFor(name: string, categoryName?: string | null) {
  const key = `${name} ${categoryName ?? ""}`.toLowerCase();
  if (serviceWords.some((word) => key.includes(word))) {
    return { Icon: Sparkles, gradient: "linear-gradient(135deg, #312e81, #7c3aed 52%, #f97316)" };
  }
  if (key.includes("medicine") || key.includes("band") || key.includes("pad")) {
    return { Icon: Pill, gradient: "linear-gradient(135deg, #064e3b, #0f766e 52%, #67e8f9)" };
  }
  if (beverageWords.some((word) => key.includes(word))) {
    return { Icon: GlassWater, gradient: "linear-gradient(135deg, #075985, #06b6d4 52%, #facc15)" };
  }
  if (foodWords.some((word) => key.includes(word))) {
    return { Icon: Utensils, gradient: "linear-gradient(135deg, #7c2d12, #ea580c 52%, #fbbf24)" };
  }
  if (key.includes("hotel") || key.includes("lodge")) {
    return { Icon: Hotel, gradient: "linear-gradient(135deg, #1e3a8a, #2563eb 52%, #f59e0b)" };
  }
  if (key.includes("daily") || key.includes("bread") || key.includes("egg")) {
    return {
      Icon: ShoppingBasket,
      gradient: "linear-gradient(135deg, #365314, #65a30d 52%, #fde047)",
    };
  }
  if (key.includes("coffee") || key.includes("tea")) {
    return { Icon: Coffee, gradient: "linear-gradient(135deg, #422006, #92400e 52%, #fbbf24)" };
  }
  return { Icon: PackageCheck, gradient: "linear-gradient(135deg, #1f2937, #475569 52%, #f97316)" };
}

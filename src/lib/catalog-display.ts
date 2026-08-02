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

export const popularPickReasons: Record<string, string> = {
  "Chicken Biryani (Plate)": "High-intent lunch and dinner order for hostel and shift workers.",
  "Idli (2 pcs)": "Repeat breakfast staple with clear unit sizing.",
  "Dosa (1 pc)": "Fast-moving tiffin item that is easy to recognize visually.",
  "Parotta (2 pcs)": "Common evening and dinner purchase in Tamil Nadu.",
  "Chicken Fried Rice (Plate)": "Frequent restaurant pickup for employees away from home.",
  "Chicken Noodles (Plate)": "Popular late lunch and dinner option.",
  "Veg Meals (Plate)": "Daily value meal with high conversion potential.",
  "Watermelon Juice (300 ml)": "Hot-weather beverage with strong impulse demand.",
  "Oreo Shake (300 ml)": "Youth-friendly beverage for repeat snack orders.",
  "Veg Puff (1 pc)": "Low-price bakery snack with strong add-on potential.",
  "Black Forest Cake (500 g)": "Celebration purchase that signals bakery depth.",
  "Coca-Cola (250 ml)": "Known beverage brand and frequent meal add-on.",
  "Sanitary Pads (Pack)": "Essential personal-care item needing discreet availability.",
  "Mobile Recharge": "Utility request that keeps MyTown useful beyond food.",
  "Hotel Booking Assistance": "Local-help differentiator for guests and family visits.",
  "Need Anything": "Catch-all assisted commerce flow for unlisted needs.",
};

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

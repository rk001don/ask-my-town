import {
  Apple,
  Armchair,
  Baby,
  Banana,
  Bandage,
  Banknote,
  Bed,
  Bike,
  BookOpen,
  Bug,
  Building2,
  Bus,
  CakeSlice,
  Camera,
  Candy,
  Car,
  CarFront,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Donut,
  Droplet,
  Droplets,
  Drumstick,
  Egg,
  FileCheck,
  FileText,
  Fish,
  Flame,
  Flower2,
  Gift,
  GlassWater,
  Grape,
  Hammer,
  HeartHandshake,
  HeartPulse,
  IdCard,
  IceCreamBowl,
  IceCreamCone,
  Landmark,
  Languages,
  Mail,
  MapPin,
  Milk,
  Package,
  PaintRoller,
  PartyPopper,
  Pill,
  Popcorn,
  Printer,
  Salad,
  Scissors,
  Shirt,
  ShoppingBag,
  Smartphone,
  Snowflake,
  Soup,
  Sparkle,
  Sparkles,
  SprayCan,
  Tent,
  Thermometer,
  Tv,
  Users,
  Utensils,
  Wheat,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { iconFor } from "@/components/icon-map";

export type CatalogView = "grid" | "list";

export const CATALOG_VIEW_KEY = "mytown.catalogView";

/**
 * Keyword -> icon, checked in order, first match wins.
 *
 * Until there are photographs this icon is the only thing distinguishing one
 * card from the next, and falling back to the *category* icon meant an entire
 * food grid was sixty-five identical forks. The list is ordered deliberately:
 * dish form ("biryani", "noodles") is matched before protein ("chicken"), so
 * "Chicken Fried Rice" reads as a rice dish rather than as poultry, while
 * "Chicken 65" -- which has no dish-form word -- still lands on the drumstick.
 *
 * Matching is substring-on-lowercased-name, so entries must be specific enough
 * not to swallow unrelated items: "roll" would catch "Cotton Roll", hence
 * "veg roll"/"chicken roll" rather than a bare "roll".
 */
const NAME_ICONS: [string[], LucideIcon][] = [
  // --- disambiguation, checked before anything else ---
  // Each of these loses to a broader rule further down if left there:
  // "Chicken Puff" would read as poultry rather than bakery, "Cotton Roll" as
  // a bread roll, "Bus Ticket Booking" as a book, "Guest & Family Stay
  // Booking" as family help.
  [["puff", "cream bun", "brownie", "veg roll", "chicken roll"], Croissant],
  [["cotton", "band-aid", "bandage", "antiseptic", "first aid", "gauze"], Bandage],
  [["bus ticket"], Bus],
  [["stay booking", "lodge"], Bed],
  [["spiral binding", "binding"], BookOpen],
  // --- prepared food: dish form first ---
  [["biryani", "kuska", "fried rice", "curd rice", "lemon rice", "tomato rice"], CookingPot],
  [["tamarind rice", "pongal", "meals", "pulao"], CookingPot],
  [["noodles", "manchurian", "soup"], Soup],
  [["kurma", "curry", "dal ", "gravy", "butter masala", "egg masala"], Soup],
  [["kothu parotta", "parotta", "chapati", "naan", "roti", "poori"], Wheat],
  [["dosa", "uttapam"], Utensils],
  [["idli", "vada", "sambar"], Soup],
  [["french fries", "fries"], Popcorn],
  // --- proteins, once no dish form matched ---
  [["chicken", "mutton", "drumstick", "kebab", "tandoori"], Drumstick],
  [["fish", "prawn", "seafood"], Fish],
  [["egg", "omelette"], Egg],
  [["paneer", "gobi", "mushroom", "veg ", "vegetable", "salad"], Salad],
  // --- drinks ---
  [["filter coffee", "coffee", "tea"], Coffee],
  [["shake", "lassi", "badam"], Milk],
  [["juice"], GlassWater],
  [["red bull", "energy"], Zap],
  [["coca-cola", "pepsi", "sprite", "fanta", "limca", "7up", "maaza", "slice", "soda"], CupSoda],
  [["milk", "curd", "buttermilk"], Milk],
  [["water can", "drinking water", "mineral water"], Droplets],
  // --- sweets, bakery, snacks ---
  [["ice cream cone", "cone"], IceCreamCone],
  [["ice cream", "family pack", "kulfi"], IceCreamBowl],
  [["cake", "brownie", "pastry"], CakeSlice],
  [["donut", "doughnut"], Donut],
  [["croissant", "bun", "bread", "veg roll", "chicken roll"], Croissant],
  [["biscuit", "good day", "oreo", "cookie", "marie"], Cookie],
  [["chocolate", "dairy milk", "kitkat", "five star", "munch", "perk", "candy"], Candy],
  [["lays", "kurkure", "bingo", "chips", "popcorn", "mixture"], Popcorn],
  // --- fruit & grocery ---
  [["apple"], Apple],
  [["banana"], Banana],
  [["grape"], Grape],
  [["orange", "sweet lime", "lemon", "mosambi"], Citrus],
  [["pomegranate", "cherry", "berry"], Cherry],
  [["watermelon", "papaya", "pineapple", "mango", "guava"], Apple],
  [["vegetables", "carrot", "onion", "tomato", "potato"], Carrot],
  [["cooking oil", "ghee", "oil"], Droplet],
  [["sugar", "rice", "atta", "flour", "dal", "pulses"], Wheat],
  [["detergent", "dishwash", "cleaning liquid"], SprayCan],
  [["baby"], Baby],
  // --- pharmacy & personal care ---
  [["thermometer"], Thermometer],
  [["heating patch", "pain relief"], HeartPulse],
  [["pregnancy test", "test kit"], HeartPulse],
  [["sanitary", "tampon", "panty liner"], HeartPulse],
  [["ors"], GlassWater],
  [["syrup", "tablet", "strip", "paracetamol", "antacid", "medicine", "capsule"], Pill],
  [["toothbrush", "toothpaste"], Sparkle],
  [["deodorant", "talcum", "perfume", "spray"], SprayCan],
  [["shampoo", "soap", "face wash", "lotion", "cream", "hair oil"], Droplet],
  [["salon", "threading", "waxing", "haircut", "grooming"], Scissors],
  // --- events ---
  [["function hall", "hall booking"], Building2],
  [["catering", "cook"], ChefHat],
  [["tent", "seating", "shamiana"], Tent],
  [["decoration"], PartyPopper],
  [["photography", "photo"], Camera],
  [["priest", "purohit", "pooja"], Flame],
  [["invitation", "printing card"], Mail],
  [["flower", "garland"], Flower2],
  // --- home services ---
  [["electrician", "wiring", "eb bill", "electricity"], Zap],
  [["plumber", "water tank", "water bill", "borewell"], Droplets],
  [["ac service", "air condition", "fridge"], Snowflake],
  [["cleaning", "housekeeping"], SprayCan],
  [["carpenter", "furniture"], Hammer],
  [["appliance", "repair"], Wrench],
  [["pest"], Bug],
  [["painting", "painter"], PaintRoller],
  // --- e-Seva & documents ---
  [["certificate"], FileCheck],
  [["aadhaar", "pan card", "voter id", "driving licence", "licence", "id card"], IdCard],
  [["passport photo"], Camera],
  [["passport"], IdCard],
  [["dth", "television"], Tv],
  [["recharge", "mobile"], Smartphone],
  [["printout", "xerox", "photocopy", "print"], Printer],
  [["bus"], Bus],
  [["cab", "taxi", "car"], Car],
  [["pension", "bill payment", "payment"], Banknote],
  [["form filling", "application", "document"], FileText],
  // --- errands & local help ---
  [["parent assistance", "family"], HeartHandshake],
  [["guest pickup"], CarFront],
  [["shopping"], ShoppingBag],
  [["queue"], Users],
  [["parcel", "courier", "pickup", "drop", "delivery"], Package],
  [["tailor", "alteration"], Shirt],
  [["translation", "language"], Languages],
  [["guide", "local guide"], MapPin],
  [["gift"], Gift],
  [["government", "office assistance"], Landmark],
  [["custom request"], Sparkles],
  // --- rentals ---
  [["bicycle", "cycle", "two-wheeler", "bike", "scooter"], Bike],
  [["chairs"], Armchair],
];

/**
 * Picks the icon shown on a product's placeholder tile when it has no photo.
 *
 * Falls back to the category's own icon when nothing in the name matches, so a
 * product never renders the anonymous question mark.
 */
export function catalogVisualFor(
  name: string,
  categoryName?: string | null,
  categoryIcon?: string | null,
): { Icon: LucideIcon; gradient: string } {
  const key = name.toLowerCase();
  let Icon: LucideIcon | null = null;
  for (const [words, candidate] of NAME_ICONS) {
    if (words.some((w) => key.includes(w))) {
      Icon = candidate;
      break;
    }
  }
  return {
    Icon: Icon ?? iconFor(categoryIcon),
    gradient: placeholderGradientFor(name),
  };
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

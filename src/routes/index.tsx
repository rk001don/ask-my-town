import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { MessageCircle, Search as SearchIcon, ArrowRight, ShoppingBag } from "lucide-react";
import { MyTownLogo } from "@/components/MyTownLogo";
import { getCategories } from "@/lib/api.functions";
import { CategoryTile } from "@/components/CategoryTile";
import { ItemCard } from "@/components/ItemCard";
import { TileSkeleton, ErrorState } from "@/components/States";
import { APP_NAME, APP_TAGLINE, APP_SUBTEXT, TOWN_NAME, waLink } from "@/lib/constants";
import { useCartCount } from "@/lib/cart-store";
import { useEffect, useState } from "react";
import { popularPickReasons } from "@/lib/catalog-display";

const categoriesOptions = queryOptions({
  queryKey: ["categories", "top"],
  queryFn: () => getCategories(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesOptions),
  head: () => ({
    meta: [
      { title: "MyTown — Need Anything? MyTown!" },
      {
        name: "description",
        content: `Assisted local commerce for ${TOWN_NAME}. Food, groceries, tickets, rentals, local help — just tell us what you need.`,
      },
      { property: "og:title", content: "MyTown — Need Anything? MyTown!" },
      {
        property: "og:description",
        content:
          "Hyperlocal assisted commerce for Karimangalam & nearby areas. Just tell us what you need — food, groceries, tickets, rentals, local help — MyTown handles the rest.",
      },
    ],
  }),
  component: Home,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

const POPULAR_PICKS: Array<{
  name: string;
  sub?: string;
  category?: string;
  iconKey?: string;
  priceLabel?: string;
}> = [
  {
    name: "Chicken Biryani (Plate)",
    sub: "dinner",
    category: "Food & Home Meals",
    iconKey: "chef-hat",
    priceLabel: "Est. ₹140",
  },
  {
    name: "Idli (2 pcs)",
    sub: "breakfast",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹20",
  },
  {
    name: "Dosa (1 pc)",
    sub: "breakfast",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹45",
  },
  {
    name: "Parotta (2 pcs)",
    sub: "dinner",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹40",
  },
  {
    name: "Chicken Fried Rice (Plate)",
    sub: "rice-chinese",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹120",
  },
  {
    name: "Chicken Noodles (Plate)",
    sub: "rice-chinese",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹120",
  },
  {
    name: "Veg Meals (Plate)",
    sub: "lunch",
    category: "Food & Home Meals",
    iconKey: "utensils",
    priceLabel: "Est. ₹90",
  },
  {
    name: "Watermelon Juice (300 ml)",
    sub: "juice",
    category: "Juices & Beverages",
    iconKey: "glass-water",
    priceLabel: "Est. ₹40",
  },
  {
    name: "Oreo Shake (300 ml)",
    sub: "juice",
    category: "Juices & Beverages",
    iconKey: "glass-water",
    priceLabel: "Est. ₹80",
  },
  {
    name: "Veg Puff (1 pc)",
    sub: "bakery",
    category: "Bakery",
    iconKey: "cookie",
    priceLabel: "Est. ₹20",
  },
  {
    name: "Black Forest Cake (500 g)",
    sub: "cakes",
    category: "Cakes",
    iconKey: "cake",
    priceLabel: "Est. ₹450",
  },
  {
    name: "Coca-Cola (250 ml)",
    sub: "beverages",
    category: "Juices & Beverages",
    iconKey: "glass-water",
    priceLabel: "Est. ₹20",
  },
  {
    name: "Sanitary Pads (Pack)",
    sub: "personal-care",
    category: "Pharmacy & Personal Care",
    iconKey: "pill",
    priceLabel: "Est. ₹45",
  },
  {
    name: "Mobile Recharge",
    sub: "eseva",
    category: "e-Seva & Documentation",
    iconKey: "smartphone",
    priceLabel: "As requested",
  },
  {
    name: "Hotel Booking Assistance",
    sub: "local-assistance",
    category: "Local Assistance",
    iconKey: "bed",
    priceLabel: "Service fee",
  },
  {
    name: "Need Anything",
    sub: "custom",
    category: "Local Assistance",
    iconKey: "sparkles",
    priceLabel: "Ask MyTown",
  },
];

function Home() {
  const { data: categories } = useSuspenseQuery(categoriesOptions);
  const cartCount = useCartCount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="rise">
      {/* Brand header */}
      <header className="flex items-center justify-between px-4 pt-5">
        <div className="flex items-center gap-3">
          <MyTownLogo className="h-11 w-11" />
          <div>
            <div className="text-display text-lg font-semibold leading-none">{APP_NAME}</div>
            <div className="text-[11px] text-[color:var(--text-muted)]">Serving {TOWN_NAME}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/search"
            aria-label="Search"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/5"
          >
            <SearchIcon className="h-5 w-5" />
          </Link>
          <a
            href={waLink()}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Chat on WhatsApp"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/5"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          <Link
            to="/cart"
            aria-label="Cart"
            className="tap-scale relative grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:bg-white/5"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0 min-w-[18px] rounded-full accent-gradient px-1 text-center text-[11px] font-bold">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Hero — compact, same content, but the dead decorative space is now
          an actual interactive quick-jump row instead of two oversized blurs */}
      <section className="px-4 pt-4">
        <div className="gradient-hero card-surface relative overflow-hidden p-4">
          <div
            className="absolute -right-10 -top-10 h-32 w-32 rounded-full"
            style={{
              background: "radial-gradient(circle, oklch(0.82 0.16 70 / 0.3), transparent 65%)",
            }}
          />
          <div className="relative">
            <h1 className="text-display text-[20px] leading-[1.15] font-bold">{APP_TAGLINE}</h1>
            <p className="mt-1 text-[13px] text-[color:var(--text-secondary)]">{APP_SUBTEXT}</p>

            {categories.length > 0 && (
              <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5">
                {categories.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to="/c/$slug"
                    params={{ slug: c.slug }}
                    className="tap-scale flex-shrink-0 rounded-full border border-[color:var(--border-strong)] bg-black/20 px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Link
                to="/explore"
                className="tap-scale inline-flex min-h-11 items-center gap-1.5 rounded-full accent-gradient px-4 py-2 text-[13px] font-semibold"
              >
                Browse all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/search"
                className="tap-scale inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[color:var(--border-strong)] bg-black/20 px-4 py-2 text-[13px] font-semibold"
              >
                <SearchIcon className="h-3.5 w-3.5" /> Search
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Popular picks */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between px-4">
          <h2 className="text-display text-lg font-semibold">Popular picks</h2>
          <Link to="/explore" className="text-xs font-semibold text-[color:var(--accent-primary)]">
            See all
          </Link>
        </div>
        <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {POPULAR_PICKS.map((p) => (
            <div key={p.name} className="w-40 shrink-0 snap-start">
              <ItemCard
                itemName={p.name}
                category={p.category}
                subcategory={p.sub}
                iconKey={p.iconKey}
                priceLabel={p.priceLabel}
                reason={popularPickReasons[p.name]}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Categories grid */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between px-4">
          <h2 className="text-display text-lg font-semibold">Categories</h2>
          <Link to="/explore" className="text-xs font-semibold text-[color:var(--accent-primary)]">
            All
          </Link>
        </div>
        {!mounted ? (
          <div className="mt-3">
            <TileSkeleton />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-3 px-4 md:grid-cols-6 lg:grid-cols-8">
            {categories.map((c) => (
              <CategoryTile
                key={c.id}
                slug={c.slug}
                name={c.name}
                iconKey={c.icon_key}
                imageUrl={c.image_url}
                compact
              />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="mt-8 px-4 pb-6">
        <h2 className="text-display text-lg font-semibold">How it works</h2>
        <ol className="mt-3 space-y-2">
          {[
            { n: 1, t: "Tell us what you need", d: "Browse or just ask — one line is enough." },
            {
              n: 2,
              t: "We call or WhatsApp you",
              d: "To confirm price & availability, whichever reaches you faster.",
            },
            {
              n: 3,
              t: "A small service fee applies",
              d: "Always shown in your cart before you order — never a surprise.",
            },
            { n: 4, t: "Delivered to your door", d: "Track status live. Pay on delivery." },
          ].map((s) => (
            <li key={s.n} className="card-surface flex items-start gap-3 p-4">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full accent-gradient text-sm font-bold">
                {s.n}
              </div>
              <div>
                <div className="text-sm font-semibold">{s.t}</div>
                <div className="text-xs text-[color:var(--text-secondary)]">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

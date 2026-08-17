import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import {
  MessageCircle,
  Search as SearchIcon,
  ArrowRight,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { MyTownLogo } from "@/components/MyTownLogo";
import { getBestSellers, getCategories, getProducts } from "@/lib/api.functions";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import { TileSkeleton, ShelfSkeleton, ErrorState } from "@/components/States";
import { openAskSheet } from "@/components/AskFAB";
import { APP_NAME, APP_TAGLINE, APP_SUBTEXT, TOWN_NAME, waLink } from "@/lib/constants";
import { useCartCount } from "@/lib/cart-store";
import { useEffect, useState } from "react";

const categoriesOptions = queryOptions({
  queryKey: ["categories", "top"],
  queryFn: () => getCategories(),
});

// Both shelves are driven by what the town actually orders, not by a tag
// someone set by hand months ago. "Popular" reads 30 days (a stable view of
// what sells); "Trending" reads 7 (what's moving right now).
//
// Each falls back to its curated tag when there isn't enough order history --
// a brand-new town would otherwise land on an empty home page.
const popularProductsOptions = queryOptions({
  queryKey: ["products", "popular", "bestsellers-30d"],
  queryFn: async () => {
    const top = await getBestSellers({ data: { days: 30, limit: 16 } });
    return top.length >= 4 ? top : getProducts({ data: { tag: "popular", limit: 16 } });
  },
});

const trendingProductsOptions = queryOptions({
  queryKey: ["products", "trending", "bestsellers-7d"],
  queryFn: async () => {
    const top = await getBestSellers({ data: { days: 7, limit: 12 } });
    return top.length >= 4 ? top : getProducts({ data: { tag: "trending", limit: 12 } });
  },
});

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(categoriesOptions),
      context.queryClient.ensureQueryData(popularProductsOptions),
      context.queryClient.ensureQueryData(trendingProductsOptions),
    ]),
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

function Home() {
  const { data: categories } = useSuspenseQuery(categoriesOptions);
  const popularQ = useQuery(popularProductsOptions);
  const trendingQ = useQuery(trendingProductsOptions);
  const cartCount = useCartCount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="rise">
      {/* Brand header */}
      <header className="flex items-center justify-between px-4 pt-5">
        <Link to="/" aria-label="MyTown home" className="tap-scale flex items-center gap-3">
          <MyTownLogo className="h-11 w-11" />
          <div>
            <div className="text-display text-lg font-semibold leading-none">{APP_NAME}</div>
            <div className="text-[11px] text-[color:var(--text-muted)]">Serving {TOWN_NAME}</div>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <a
            href={waLink()}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Chat on WhatsApp"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          <Link
            to="/cart"
            aria-label="Cart"
            className="tap-scale relative grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full accent-gradient px-1 text-center text-[11px] font-bold leading-[18px]">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Real tappable search bar, not just an icon -- this is the first
          thing people scan for on a food-ordering-style home screen. */}
      <div className="px-4 pt-3">
        <Link
          to="/search"
          className="tap-scale flex min-h-11 items-center gap-2.5 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] px-4 py-2.5 text-[14px] text-[color:var(--text-muted)]"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          Search for idli, medicines, help…
        </Link>
      </div>

      {/* Hero — brand tagline + category quick-jump, surfaced right under
          search so it's the second thing anyone sees (the "Need Anything?
          MyTown!" identity card). */}
      <section className="px-4 pt-4">
        <div className="gradient-hero card-surface relative overflow-hidden p-4">
          <div className="accent-halo absolute -right-10 -top-10 h-32 w-32 rounded-full" />
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
                    className="tap-scale flex-shrink-0 rounded-full border border-[color:var(--border-strong)] surface-muted px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap"
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
            </div>
          </div>
        </div>
      </section>

      {/* Popular picks — horizontal shelf (matches the Trending/Explore card
          pattern) so it reads as a quick-scan row, not a dense grid.
          Gated on `mounted` (not just isLoading) for the same reason as
          Categories below: the loader already resolves this data during SSR,
          so the server render shows real cards while the client's first
          hydration pass — before the query cache rehydrates — briefly sees
          isLoading again, causing a hydration mismatch. Forcing the skeleton
          until mount keeps the very first client render identical to the
          server's, matching React's hydration requirement. */}
      {(!mounted || popularQ.isLoading || (popularQ.data?.length ?? 0) > 0) && (
        <section className="pt-6">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-display text-lg font-semibold">Popular picks</h2>
            <Link
              to="/explore"
              className="text-xs font-semibold text-[color:var(--accent-primary)]"
            >
              See all
            </Link>
          </div>
          {!mounted || popularQ.isLoading ? (
            <div className="mt-3">
              <ShelfSkeleton />
            </div>
          ) : (
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {(popularQ.data ?? []).map((p) => (
                <div key={p.id} className="w-[152px] shrink-0">
                  <ProductCard product={p} categoryName={p.categories?.name} view="grid" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Categories grid */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between px-4">
          <h2 className="text-display text-lg font-semibold">Categories</h2>
          <Link to="/explore" className="text-xs font-semibold text-[color:var(--accent-primary)]">
            See all
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

      {/* Trending picks — a curated shelf into the existing catalog (self-care
          + snacking essentials), horizontal so it stays a quick reorder shelf
          distinct from Popular picks above. Same `mounted` gate as Popular
          picks above, to avoid the hydration mismatch described there. */}
      {(!mounted || trendingQ.isLoading || (trendingQ.data?.length ?? 0) > 0) && (
        <section className="pt-8">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-display text-lg font-semibold">Trending picks</h2>
            <Link
              to="/explore"
              className="text-xs font-semibold text-[color:var(--accent-primary)]"
            >
              See all
            </Link>
          </div>
          {!mounted || trendingQ.isLoading ? (
            <div className="mt-3">
              <ShelfSkeleton />
            </div>
          ) : (
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {(trendingQ.data ?? []).map((p) => (
                <div key={p.id} className="w-[152px] shrink-0">
                  <ProductCard product={p} categoryName={p.categories?.name} view="grid" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Secondary catch-all CTA — kept below the main shelves so it doesn't
          compete with Popular/Categories/Trending for the first scroll, but
          still visible before someone reaches the end of the page. Mirrors
          the same dashed-fallback pattern used on category pages. */}
      <section className="px-4 pt-8">
        <button
          onClick={() => openAskSheet()}
          className="tap-scale card-surface flex w-full items-center gap-3 p-4 text-left"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full accent-gradient">
            <Sparkles className="h-5 w-5 text-[color:var(--on-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Don't see it? Just ask.</div>
            <div className="text-xs text-[color:var(--text-secondary)]">
              Tell us what you need — medicine, a repair, tickets, anything local.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
        </button>
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

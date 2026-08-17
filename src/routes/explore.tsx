import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { getCategories, getProducts } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard, type ProductRow } from "@/components/ProductCard";
import { ProductSheet } from "@/components/ProductSheet";
import { TileSkeleton, ShelfSkeleton, ErrorState } from "@/components/States";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";

export const opts = queryOptions({
  queryKey: ["categories", "top"],
  queryFn: () => getCategories(),
});

const trendingOpts = queryOptions({
  queryKey: ["products", "trending"],
  queryFn: () => getProducts({ data: { tag: "trending", limit: 12 } }),
});

export const Route = createFileRoute("/explore")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(opts),
      context.queryClient.ensureQueryData(trendingOpts),
    ]),
  head: () => ({
    meta: [
      { title: "Explore — MyTown" },
      {
        name: "description",
        content:
          "Browse everything MyTown can arrange for you: food, daily needs, beauty, travel, rentals, local help.",
      },
      { property: "og:title", content: "Explore — MyTown" },
      { property: "og:description", content: "Every category MyTown can arrange for you." },
    ],
  }),
  component: Explore,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

function Explore() {
  const { data } = useSuspenseQuery(opts);
  const trendingQ = useQuery(trendingOpts);
  const [mounted, setMounted] = useState(false);
  // Trending cards here did nothing when tapped -- the detail sheet was wired
  // up on category pages and the home shelves but not this one.
  const [openProduct, setOpenProduct] = useState<ProductRow | null>(null);
  useEffect(() => setMounted(true), []);
  return (
    <div>
      <AppHeader title="Explore" showBack={false} />
      {/* Same tappable search bar as the home screen. Explore is where people
          come when they don't know which category a thing lives in, so it's
          the screen that needs search most, and it was the one screen without
          it. */}
      <div className="px-4 pt-3">
        <Link
          to="/search"
          className="tap-scale flex min-h-11 items-center gap-2.5 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] px-4 py-2.5 text-[14px] text-[color:var(--text-muted)]"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          Search for idli, medicines, help…
        </Link>
      </div>
      <div className="p-4">
        <h2 className="text-display text-2xl font-bold">What do you need today?</h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          Tap a category to see options, or just ask us.
        </p>
      </div>
      {(!mounted || trendingQ.isLoading || (trendingQ.data?.length ?? 0) > 0) && (
        <div className="pb-6">
          <h3 className="px-4 text-sm font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
            Trending picks
          </h3>
          {!mounted || trendingQ.isLoading ? (
            <div className="mt-3">
              <ShelfSkeleton />
            </div>
          ) : (
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {(trendingQ.data ?? []).map((p) => (
                <div key={p.id} className="w-[152px] shrink-0">
                  <ProductCard
                    product={p}
                    categoryName={p.categories?.name}
                    view="grid"
                    onOpen={setOpenProduct}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!mounted ? (
        <TileSkeleton count={12} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-8 md:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => (
            <CategoryTile
              key={c.id}
              slug={c.slug}
              name={c.name}
              iconKey={c.icon_key}
              imageUrl={c.image_url}
            />
          ))}
        </div>
      )}
      {openProduct && (
        <ProductSheet
          product={openProduct}
          categoryName={openProduct.categories?.name}
          categoryIcon={openProduct.categories?.icon_key}
          onClose={() => setOpenProduct(null)}
        />
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { getCategories, getProducts } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import { TileSkeleton, CardSkeleton, ErrorState } from "@/components/States";
import { useEffect, useState } from "react";

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
  useEffect(() => setMounted(true), []);
  return (
    <div>
      <AppHeader title="Explore" showBack={false} />
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
            <div className="mt-3 px-4">
              <CardSkeleton />
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
    </div>
  );
}

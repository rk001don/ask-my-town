import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getCategories } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTile } from "@/components/CategoryTile";
import { TileSkeleton, ErrorState } from "@/components/States";
import { useEffect, useState } from "react";

export const opts = queryOptions({ queryKey: ["categories", "top"], queryFn: () => getCategories() });

export const Route = createFileRoute("/explore")({
  loader: ({ context }) => context.queryClient.ensureQueryData(opts),
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

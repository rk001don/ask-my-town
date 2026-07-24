import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProducts, getSubcategories } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { ItemCard } from "@/components/ItemCard";
import { ProductCard, type ProductRow } from "@/components/ProductCard";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import { useEffect, useMemo, useState } from "react";

const subOpts = (slug: string) =>
  queryOptions({
    queryKey: ["subcategories", slug],
    queryFn: () => getSubcategories({ data: { slug } }),
  });

const prodOpts = (slug: string) =>
  queryOptions({
    queryKey: ["products", slug],
    queryFn: () => getProducts({ data: { categorySlug: slug } }),
  });

export const Route = createFileRoute("/c/$slug")({
  loader: async ({ context, params }) => {
    const [sub] = await Promise.all([
      context.queryClient.ensureQueryData(subOpts(params.slug)),
      context.queryClient.ensureQueryData(prodOpts(params.slug)),
    ]);
    if (!sub.parent) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `${titleize(params.slug)} — MyTown` },
      {
        name: "description",
        content: `Browse ${titleize(params.slug)} on MyTown, or just tell us what you need.`,
      },
    ],
  }),
  component: Category,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  notFoundComponent: () => (
    <EmptyState
      title="Category not found"
      message="We can't find that category. Head back to Explore, or just ask."
    />
  ),
});

function titleize(slug: string) {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

const GROUP_LABELS: Record<string, string> = {
  tiffin: "Breakfast tiffin",
  meals: "Meals",
  restaurant: "Restaurant favourites",
  snacks: "Snacks & beverages",
  groceries: "Groceries & essentials",
  health: "Health & wellness",
  cosmetics: "Personal care",
  salon: "At-home services",
  utility: "Recharge & utility",
  stationery: "Stationery",
  remittance: "Bookings & courier",
};

function Category() {
  const { slug } = Route.useParams();
  const { data: sub } = useSuspenseQuery(subOpts(slug));
  const { data: products } = useSuspenseQuery(prodOpts(slug));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const groups = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    for (const p of products as ProductRow[]) {
      const g = p.tags?.[0] ?? "other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return [...map.entries()];
  }, [products]);

  if (!sub.parent) return null;

  return (
    <div>
      <AppHeader title={sub.parent.name} />
      {!mounted ? (
        <CardSkeleton />
      ) : products.length > 0 ? (
        <div className="space-y-6 p-4 pb-24">
          {groups.map(([groupKey, items]) => (
            <section key={groupKey}>
              {groups.length > 1 && (
                <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                  {GROUP_LABELS[groupKey] ?? titleize(groupKey)}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} categoryName={sub.parent!.name} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : sub.items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          message={`We don't have curated ${sub.parent.name} items yet. Tell us what you're looking for.`}
          askPrefill={`I need ${sub.parent.name.toLowerCase()}: `}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-4">
          {sub.items.map((it) => (
            <ItemCard
              key={it.id}
              itemName={it.name}
              category={sub.parent!.name}
              subcategory={it.slug}
              iconKey={it.icon_key}
            />
          ))}
        </div>
      )}
    </div>
  );
}

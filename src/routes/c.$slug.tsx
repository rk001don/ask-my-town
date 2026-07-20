import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSubcategories } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { ItemCard } from "@/components/ItemCard";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import { useEffect, useState } from "react";

const opts = (slug: string) =>
  queryOptions({
    queryKey: ["subcategories", slug],
    queryFn: () => getSubcategories({ data: { slug } }),
  });

export const Route = createFileRoute("/c/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(opts(params.slug));
    if (!data.parent) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `${titleize(params.slug)} — MyTown` },
      { name: "description", content: `Browse ${titleize(params.slug)} on MyTown, or just tell us what you need.` },
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
  return slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

function Category() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(opts(slug));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!data.parent) return null;

  return (
    <div>
      <AppHeader title={data.parent.name} />
      {!mounted ? (
        <CardSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          message={`We don't have curated ${data.parent.name} items yet. Tell us what you're looking for.`}
          askPrefill={`I need ${data.parent.name.toLowerCase()}: `}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4">
          {data.items.map((it) => (
            <ItemCard
              key={it.id}
              itemName={it.name}
              category={data.parent!.name}
              subcategory={it.slug}
              iconKey={it.icon_key}
            />
          ))}
        </div>
      )}
    </div>
  );
}

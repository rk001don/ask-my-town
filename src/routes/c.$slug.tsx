import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getProducts, getSubcategories } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { ItemCard } from "@/components/ItemCard";
import { openAskSheet } from "@/components/AskFAB";
import { ProductCard, type ProductRow } from "@/components/ProductCard";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import { Grid2X2, List, Sparkles } from "lucide-react";
import { CATALOG_VIEW_KEY, type CatalogView } from "@/lib/catalog-display";
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
  "rice-chinese": "Rice & Chinese",
  "side-dishes": "Side Dishes",
  curries: "Curry & Gravies",
  juice: "Fresh Juices",
  shake: "Milkshakes",
  "soft-drink": "Beverages",
  "ice-cream": "Ice Cream",
  chocolate: "Chocolates",
  snack: "Snacks",
  medicine: "Medicines",
  "first-aid": "First Aid",
  "womens-essentials": "Women's Essentials",
  "personal-care": "Personal Care",
  rental: "Rentals",
  eseva: "e-Seva & Documentation",
  "local-service": "Local Assistance",
};

function Category() {
  const { slug } = Route.useParams();
  const { data: sub } = useSuspenseQuery(subOpts(slug));
  const { data: products } = useSuspenseQuery(prodOpts(slug));
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<CatalogView>("grid");
  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(CATALOG_VIEW_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  function chooseView(next: CatalogView) {
    setView(next);
    window.localStorage.setItem(CATALOG_VIEW_KEY, next);
  }

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

  const hasProducts = products.length > 0;
  const hasSubcategories = sub.items.length > 0;
  const hasNothing = !hasProducts && !hasSubcategories;

  return (
    <div>
      <AppHeader title={sub.parent.name} />
      {!mounted ? (
        <CardSkeleton />
      ) : hasNothing ? (
        <EmptyState
          title="Nothing here yet"
          message={`We don't have curated ${sub.parent.name} items yet. Tell us what you're looking for.`}
          askPrefill={`I need ${sub.parent.name.toLowerCase()}: `}
        />
      ) : (
        <div className="space-y-6 p-4 pb-24">
          {hasProducts && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[color:var(--text-secondary)]">
                Grid is optimized for quick food ordering. Switch any time.
              </p>
              <div
                className="flex shrink-0 rounded-full border border-[color:var(--border-strong)] bg-black/20 p-1"
                aria-label="Catalog view"
              >
                <button
                  type="button"
                  onClick={() => chooseView("grid")}
                  aria-pressed={view === "grid"}
                  className={`tap-scale grid h-9 w-9 place-items-center rounded-full ${view === "grid" ? "accent-gradient" : "text-[color:var(--text-secondary)]"}`}
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => chooseView("list")}
                  aria-pressed={view === "list"}
                  className={`tap-scale grid h-9 w-9 place-items-center rounded-full ${view === "list" ? "accent-gradient" : "text-[color:var(--text-secondary)]"}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {/* Priced catalog — the primary content, always shown first when it exists */}
          {hasProducts &&
            groups.map(([groupKey, items]) => (
              <section key={groupKey}>
                {groups.length > 1 && (
                  <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                    {GROUP_LABELS[groupKey] ?? titleize(groupKey)}
                  </h2>
                )}
                <div
                  className={
                    view === "grid"
                      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                      : "grid grid-cols-1 gap-2 sm:grid-cols-2"
                  }
                >
                  {items.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      categoryName={sub.parent!.name}
                      categoryIcon={sub.parent!.icon_key}
                      view={view}
                    />
                  ))}
                </div>
              </section>
            ))}

          {/* Subcategory browsing — secondary to the catalog, shown after it */}
          {hasSubcategories && (
            <section>
              {hasProducts && (
                <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                  More in {sub.parent.name}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {sub.items.map((it) => (
                  <ItemCard
                    key={it.id}
                    itemName={it.name}
                    category={sub.parent!.name}
                    subcategory={it.slug}
                    iconKey={it.icon_key}
                    imageUrl={it.image_url}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Always-present, clearly secondary fallback — never competes with the
              catalog above it, just quietly available for anything not listed. */}
          <button
            onClick={() => openAskSheet(`I need ${sub.parent!.name.toLowerCase()}: `)}
            className="tap-scale flex w-full items-center gap-3 rounded-2xl border border-dashed border-[color:var(--border-strong)] p-4 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent-primary)]/10">
              <Sparkles className="h-4 w-4 text-[color:var(--accent-primary)]" />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Didn't find what you're looking for?
              </span>
              <span className="block text-xs text-[color:var(--text-secondary)]">
                Ask MyTown and we'll arrange it for you
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

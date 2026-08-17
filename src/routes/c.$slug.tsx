import { createFileRoute, notFound, useSearch } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getProducts, getSubcategories } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { ItemCard } from "@/components/ItemCard";
import { openAskSheet } from "@/components/AskFAB";
import { ProductCard, type ProductRow } from "@/components/ProductCard";
import { ProductSheet } from "@/components/ProductSheet";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/States";
import { Grid2X2, List, Sparkles } from "lucide-react";
import { CATALOG_VIEW_KEY, type CatalogView } from "@/lib/catalog-display";
import { useEffect, useMemo, useState } from "react";

const categorySearchSchema = z.object({
  highlight: z.string().optional(),
});

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
    // Hand the real category name to `head` below. Deriving the page title
    // from the slug produced titles that disagreed with the page: /c/beauty
    // showed "Pharmacy & Personal Care" but was titled "Beauty", and
    // "Food & Home Meals" was titled just "Food" -- which is what a browser
    // tab, a bookmark and a shared link all display.
    return { categoryName: sub.parent.name };
  },
  validateSearch: (s) => categorySearchSchema.parse(s),
  head: ({ params, loaderData }) => {
    const name = loaderData?.categoryName ?? titleize(params.slug);
    return {
      meta: [
        { title: `${name} — MyTown` },
        {
          name: "description",
          content: `Browse ${name} on MyTown, or just tell us what you need.`,
        },
      ],
    };
  },
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

const GROUP_ORDER = ["breakfast", "lunch", "dinner", "snack"];

// "popular"/"trending" are curation flags used to build the Home/Explore
// shelves (see getProducts({tag})) -- they describe *which* products are
// spotlighted elsewhere, not what subgroup a product belongs to here. Some
// catalog rows have one of these listed before their real subgroup tag
// (e.g. ["popular","restaurant"]), which used to make tags[0] pick the flag
// itself, dropping the product into a stray "Popular" heading instead of
// its actual group. Skip flags when choosing the group key so grouping
// reflects the product's real category regardless of tag order.
const CURATION_FLAGS = new Set(["popular", "trending"]);

// A handful of catalog rows use "local-assistance" as a synonym for the
// "local-service" group -- both titleize to the same visible "Local
// Assistance" heading, which without this alias renders as two separate,
// identically-labelled sections back to back on the Local Assistance
// category page. Fold them into one group.
const GROUP_KEY_ALIASES: Record<string, string> = {
  "local-assistance": "local-service",
  // "side-dishes" and "curries" describe the same thing to a customer, and as
  // separate filter chips they read as a distinction without a difference
  // ("Curries & Accompaniments" next to "Curries & Gravies"). One group.
  "side-dishes": "curries",
};

/** Meal-time order first, then anything else, with the catch-all last. */
function orderGroupKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
}

function groupKeyFor(tags: string[] | null | undefined): string {
  const tag = tags?.find((t) => !CURATION_FLAGS.has(t));
  if (!tag) return "other";
  return GROUP_KEY_ALIASES[tag] ?? tag;
}

const GROUP_LABELS: Record<string, string> = {
  tiffin: "Breakfast Tiffin",
  meals: "Meals",
  restaurant: "Restaurant Favourites",
  snacks: "Snacks & Beverages",
  groceries: "Groceries & Essentials",
  health: "Health & Wellness",
  cosmetics: "Personal care",
  salon: "Salon & Grooming",
  utility: "Recharge & Bill Payments",
  stationery: "Stationery",
  remittance: "Bookings & Courier",
  "rice-chinese": "Rice & Chinese",
  curries: "Curries & Sides",
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
  const { highlight } = useSearch({ from: "/c/$slug" });
  const { data: sub } = useSuspenseQuery(subOpts(slug));
  const { data: products } = useSuspenseQuery(prodOpts(slug));
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<CatalogView>("grid");
  const [vegOnly, setVegOnly] = useState(false);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [openProduct, setOpenProduct] = useState<ProductRow | null>(null);
  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(CATALOG_VIEW_KEY);
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  // Coming from search: open the dish the customer actually tapped.
  //
  // This used to only scroll and flash a ring, which left them looking at a
  // category page and hunting for the row that matched -- the exact "it takes
  // me to the folder, not the product" complaint. Now the detail sheet opens
  // directly, and the scroll still happens underneath so closing it leaves
  // them in the right place.
  useEffect(() => {
    if (!highlight || !mounted) return;
    const match = (products as ProductRow[]).find((p) => p.id === highlight);
    const t = requestAnimationFrame(() => {
      document
        .getElementById(`product-${highlight}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (match) setOpenProduct(match);
    });
    setHighlightedId(highlight);
    const fade = setTimeout(() => setHighlightedId(null), 2200);
    return () => {
      cancelAnimationFrame(t);
      clearTimeout(fade);
    };
  }, [highlight, mounted, products]);

  function chooseView(next: CatalogView) {
    setView(next);
    window.localStorage.setItem(CATALOG_VIEW_KEY, next);
  }

  // Only offer the veg toggle where the data can answer it -- a category with
  // no veg flags at all (rentals, e-Seva) would otherwise show a filter that
  // blanks the page.
  const hasVegData = useMemo(
    () => (products as ProductRow[]).some((p) => p.is_veg != null),
    [products],
  );

  // Every group present in this category, regardless of what's filtered --
  // the chip row must stay stable as selections change, or chips would
  // disappear as you use them and there'd be no way to undo a selection.
  const allGroupKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const p of products as ProductRow[]) seen.add(groupKeyFor(p.tags));
    return orderGroupKeys([...seen]);
  }, [products]);

  function toggleGroup(key: string) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    let visible = products as ProductRow[];
    if (vegOnly) visible = visible.filter((p) => p.is_veg === true);
    // Chips filter the list in place rather than scrolling to a heading.
    // Nothing selected means everything, which is what makes deselecting the
    // last chip a natural "show me all again".
    if (activeGroups.size > 0) {
      visible = visible.filter((p) => activeGroups.has(groupKeyFor(p.tags)));
    }
    for (const p of visible) {
      const g = groupKeyFor(p.tags);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    // Untagged items land in a catch-all "other" bucket keyed by wherever
    // they first appear in the query result -- without an explicit order
    // that could put "Other" ahead of "Breakfast"/"Lunch". Pin known
    // meal-time groups to a sensible sequence and always sink "other" last.
    const ordered = orderGroupKeys([...map.keys()]);
    return ordered.map((k) => [k, map.get(k)!] as [string, ProductRow[]]);
  }, [products, vegOnly, activeGroups]);

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
              {/* Veg filter — the one filter an Indian food catalogue is always
                  expected to have. Only rendered where it means something: a
                  category whose items actually carry a veg/non-veg flag (food
                  does; rentals and e-Seva don't). */}
              {hasVegData ? (
                <button
                  type="button"
                  onClick={() => setVegOnly((v) => !v)}
                  aria-pressed={vegOnly}
                  className={`tap-scale flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                    vegOnly
                      ? "border-[color:var(--success)] bg-[color:var(--success)]/15 text-[color:var(--success)]"
                      : "border-[color:var(--border-strong)] bg-black/20 text-[color:var(--text-secondary)]"
                  }`}
                >
                  <span
                    className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border-[1.5px]"
                    style={{ borderColor: "var(--success)" }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--success)" }}
                    />
                  </span>
                  Veg only
                </button>
              ) : (
                <p className="text-xs text-[color:var(--text-secondary)]">Switch view anytime</p>
              )}
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
          {/* Filter chips. These used to scroll the page to a heading, which
              meant you still had to scan past everything else -- every serious
              food app narrows the list in place instead. Multi-select, and
              deselecting the last one restores everything. Sticky so the
              controls stay reachable while scrolling a long category. */}
          {hasProducts && allGroupKeys.length > 1 && (
            <div className="sticky top-[var(--app-header-h,3.5rem)] z-[var(--z-sticky)] -mx-4 bg-[color:var(--bg-base)]/95 px-4 py-2 backdrop-blur">
              <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
                {activeGroups.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveGroups(new Set())}
                    className="tap-scale flex-shrink-0 rounded-full border border-[color:var(--border-strong)] px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-[color:var(--text-secondary)]"
                  >
                    Clear
                  </button>
                )}
                {allGroupKeys.map((groupKey) => {
                  const on = activeGroups.has(groupKey);
                  return (
                    <button
                      key={groupKey}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGroup(groupKey)}
                      className={`tap-scale flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap ${
                        on
                          ? "border-transparent accent-gradient"
                          : "border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)]"
                      }`}
                    >
                      {groupKey === "other"
                        ? "More"
                        : (GROUP_LABELS[groupKey] ?? titleize(groupKey))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Veg filter on, nothing matched: say so and offer the way out,
              rather than leaving an apparently-broken blank page. */}
          {hasProducts && groups.length === 0 && (vegOnly || activeGroups.size > 0) && (
            <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] px-4 py-10 text-center">
              <p className="text-sm font-semibold">Nothing matches those filters</p>
              <button
                type="button"
                onClick={() => {
                  setVegOnly(false);
                  setActiveGroups(new Set());
                }}
                className="tap-scale mt-3 rounded-full border border-[color:var(--border-strong)] px-4 py-2 text-[13px] font-semibold"
              >
                Show everything
              </button>
            </div>
          )}
          {/* Priced catalog — the primary content, always shown first when it exists */}
          {hasProducts &&
            groups.map(([groupKey, items]) => (
              <section key={groupKey} id={`group-${groupKey}`} className="scroll-mt-20">
                {groups.length > 1 && (
                  <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                    {groupKey === "other" ? "More" : (GROUP_LABELS[groupKey] ?? titleize(groupKey))}
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
                      onOpen={setOpenProduct}
                      key={p.id}
                      id={`product-${p.id}`}
                      highlighted={p.id === highlightedId}
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
      {openProduct && (
        <ProductSheet
          product={openProduct}
          categoryName={sub.parent.name}
          categoryIcon={sub.parent.icon_key}
          onClose={() => setOpenProduct(null)}
        />
      )}
    </div>
  );
}

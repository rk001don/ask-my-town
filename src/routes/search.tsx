import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getTrendingSearches, searchItems } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search as SearchIcon,
  X,
  Sparkles as SparklesIcon,
  Utensils,
  ChevronRight,
} from "lucide-react";
import { iconFor } from "@/components/icon-map";
import { openAskSheet } from "@/components/AskFAB";
import { placeholderGradientFor } from "@/lib/catalog-display";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — MyTown" },
      {
        name: "description",
        content: "Search for anything you need. If we don't list it, just ask.",
      },
    ],
  }),
  component: SearchPage,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
});

const RECENTS_KEY = "mytown.search.recent.v1";

function SearchPage() {
  const search = useServerFn(searchItems);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof search>>["results"]>([]);
  const [productResults, setProductResults] = useState<
    NonNullable<Awaited<ReturnType<typeof search>>["productResults"]>
  >([]);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [recents, setRecents] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const trendingFn = useServerFn(getTrendingSearches);

  // Real trending, from what people have actually searched in the last two
  // weeks. Best-effort: if it fails or there's not enough history yet, the
  // section simply doesn't render rather than showing stale placeholders.
  useEffect(() => {
    let cancelled = false;
    trendingFn()
      .then((t) => {
        if (!cancelled) setTrending(t ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trendingFn]);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw));
    } catch {
      /* localStorage unavailable (private browsing, quota) -- recents just stay empty */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      setProductResults([]);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    search({ data: { q: debounced.trim() } })
      .then((r) => {
        if (cancelled) return;
        setResults(r.results);
        setProductResults(r.productResults ?? []);
        setState("loaded");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [debounced, search]);

  function saveRecent(term: string) {
    const next = [term, ...recents.filter((r) => r !== term)].slice(0, 6);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable (private browsing, quota) -- non-fatal */
    }
  }

  const showEmpty =
    state === "loaded" &&
    results.length === 0 &&
    productResults.length === 0 &&
    debounced.trim().length >= 2;

  return (
    <div>
      <AppHeader title="Search" showSearch={false} />
      <div className="sticky top-14 z-[var(--z-sticky)] px-4 pt-2 pb-3 glass">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) saveRecent(q.trim());
            }}
            placeholder="Search groceries, tickets, services…"
            className="w-full rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] py-3 pl-9 pr-9 text-[15px] placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-primary)] focus:outline-none"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear"
              className="tap-scale absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-[color:var(--text-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {debounced.trim().length < 2 && (
        <div className="p-4">
          {recents.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                Recent
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQ(r)}
                    className="tap-scale rounded-full border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] px-3 py-1.5 text-sm"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}
          {trending.length > 0 && (
            <>
              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                Trending in Karimangalam
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {trending.map((t) => (
                  <button
                    key={t}
                    onClick={() => setQ(t)}
                    className="tap-scale rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] px-3 py-1.5 text-sm"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {state === "loading" && (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      )}

      {state === "error" && <ErrorState onRetry={() => setDebounced((v) => v + " ")} />}

      {state === "loaded" && productResults.length > 0 && (
        <ul className="space-y-2 p-4 pb-0">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Dishes & items
          </h3>
          {productResults.map((p) => (
            <li key={p.id}>
              <Link
                to="/c/$slug"
                params={{ slug: p.category_slug ?? "" }}
                search={{ highlight: p.id }}
                onClick={() => saveRecent(debounced.trim())}
                className="tap-scale card-surface flex items-center gap-3 p-2.5"
              >
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl"
                  style={p.image_url ? undefined : { background: placeholderGradientFor(p.name) }}
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Utensils className="h-5 w-5 text-white/45" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {p.is_veg != null && (
                      <span
                        aria-label={p.is_veg ? "Veg" : "Non-veg"}
                        className="grid h-3 w-3 shrink-0 place-items-center rounded-[2px] border"
                        style={{ borderColor: p.is_veg ? "var(--success)" : "var(--danger)" }}
                      >
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ background: p.is_veg ? "var(--success)" : "var(--danger)" }}
                        />
                      </span>
                    )}
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  </div>
                  {p.category_name && (
                    <div className="truncate text-[11px] text-[color:var(--text-muted)]">
                      {p.category_name}
                    </div>
                  )}
                  <div
                    className={
                      p.show_price && p.price != null
                        ? "mt-0.5 text-[14px] font-bold text-[color:var(--accent-primary)]"
                        : "mt-0.5 text-[11px] font-medium text-[color:var(--text-muted)]"
                    }
                  >
                    {p.show_price && p.price != null ? `₹${p.price}` : "Price on request"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {state === "loaded" && results.length > 0 && (
        <ul className="space-y-2 p-4 pt-2">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Categories
          </h3>
          {results.map((r) => {
            const Icon = iconFor(r.icon_key);
            const isSub = !!r.parent_id;
            return (
              <li key={r.id}>
                <Link
                  to="/c/$slug"
                  params={{ slug: isSub ? (r.parent_slug ?? r.slug) : r.slug }}
                  onClick={() => saveRecent(debounced.trim())}
                  className="tap-scale card-surface flex items-center gap-3 p-3"
                >
                  <div className="accent-wash grid h-11 w-11 place-items-center rounded-2xl">
                    <Icon className="h-5 w-5 text-[color:var(--accent-primary)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{r.name}</div>
                    {isSub && r.parent_name && (
                      <div className="truncate text-xs text-[color:var(--text-muted)]">
                        {r.parent_name}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Consistent with the category page: results (if any) are primary and
          shown above; this fallback is always present once the customer has
          actually searched for something, never only-shown-if-zero-results --
          otherwise a partial match silently has no path to "ask for the rest." */}
      {state === "loaded" && !showEmpty && debounced.trim().length >= 2 && (
        <div className="px-4 pb-6">
          <button
            onClick={() => openAskSheet(`I need ${debounced.trim()}: `)}
            className="tap-scale flex w-full items-center gap-3 rounded-2xl border border-dashed border-[color:var(--border-strong)] p-4 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent-primary)]/10">
              <SparklesIcon className="h-4 w-4 text-[color:var(--accent-primary)]" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Not quite what you wanted?</span>
              <span className="block text-xs text-[color:var(--text-secondary)]">
                Ask MyTown for "{debounced.trim()}" directly
              </span>
            </span>
          </button>
        </div>
      )}

      {showEmpty && (
        <EmptyState
          title="We don't list that yet"
          message="Type it out and we'll arrange it. That's what MyTown is for."
          askPrefill={`I need ${debounced.trim()}: `}
        />
      )}
    </div>
  );
}

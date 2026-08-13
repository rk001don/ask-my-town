import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { searchItems } from "@/lib/api.functions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon, X, Sparkles as SparklesIcon } from "lucide-react";
import { iconFor } from "@/components/icon-map";
import { openAskSheet } from "@/components/AskFAB";

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

const TRENDING = [
  "Home-cooked meals",
  "Medicines",
  "Groceries",
  "Bus tickets",
  "Plumber",
  "AC service",
];
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
  const inputRef = useRef<HTMLInputElement>(null);

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
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Trending
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRENDING.map((t) => (
              <button
                key={t}
                onClick={() => setQ(t)}
                className="tap-scale rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] px-3 py-1.5 text-sm"
              >
                {t}
              </button>
            ))}
          </div>
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
                onClick={() => saveRecent(debounced.trim())}
                className="tap-scale flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-3"
              >
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="text-sm font-bold text-[color:var(--accent-primary)]">
                  {p.show_price && p.price != null ? `₹${p.price}` : "Price on request"}
                </span>
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
                  <div
                    className="grid h-11 w-11 place-items-center rounded-2xl"
                    style={{
                      background:
                        "linear-gradient(140deg, oklch(0.82 0.16 70 / 0.18), oklch(0.72 0.19 30 / 0.16))",
                    }}
                  >
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

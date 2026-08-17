import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { openAskSheet } from "./AskFAB";

export function EmptyState({
  title,
  message,
  action,
  askPrefill,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  askPrefill?: string;
}) {
  return (
    <div className="rise mx-auto flex max-w-sm flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="accent-wash-strong grid h-16 w-16 place-items-center rounded-full">
        <Sparkles className="h-7 w-7 text-[color:var(--accent-primary)]" />
      </div>
      <h2 className="text-display text-xl">{title}</h2>
      <p className="text-sm text-[color:var(--text-secondary)]">{message}</p>
      <div className="mt-2 flex flex-col items-center gap-2">
        {action}
        <button
          onClick={() => openAskSheet(askPrefill)}
          className="tap-scale rounded-full accent-gradient px-5 py-2.5 text-sm font-semibold"
        >
          Ask MyTown
        </button>
      </div>
    </div>
  );
}

export function ErrorState({
  onRetry,
  message = "Something didn't load. Try again in a moment.",
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="rise mx-auto flex max-w-sm flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h2 className="text-display text-xl">Hiccup on our end</h2>
      <p className="text-sm text-[color:var(--text-secondary)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="tap-scale mt-2 rounded-full accent-gradient px-5 py-2.5 text-sm font-semibold"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-surface overflow-hidden">
          <div className="skeleton h-28 w-full rounded-none" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton mt-2 h-8 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Matches the horizontal scrollable shelves (Popular picks / Trending picks
// on Home and Explore) -- CardSkeleton's 2-column grid shape doesn't match
// that single-row layout, so using it there flashes a grid briefly before
// the real horizontal row of cards replaces it.
export function ShelfSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-surface w-[152px] shrink-0 overflow-hidden">
          <div className="skeleton aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton mt-2 h-8 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TileSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-3 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div className="skeleton h-14 w-14 rounded-2xl" />
          <div className="skeleton h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

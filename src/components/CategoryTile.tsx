import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { iconFor } from "./icon-map";

type Props = {
  slug: string;
  name: string;
  iconKey?: string | null;
  imageUrl?: string | null;
  compact?: boolean;
};

export function CategoryTile({ slug, name, iconKey, imageUrl, compact }: Props) {
  const Icon = iconFor(iconKey);
  const [imageFailed, setImageFailed] = useState(false);
  const safeImageUrl = imageUrl && !imageFailed ? imageUrl : null;
  return (
    <Link
      to="/c/$slug"
      params={{ slug }}
      className="tap-scale group flex flex-col items-center justify-center gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-3 text-center"
    >
      <div
        className={`grid place-items-center overflow-hidden rounded-2xl ${compact ? "h-11 w-11" : "h-14 w-14"}`}
        style={safeImageUrl ? undefined : { border: "1px solid var(--border-subtle)" }}
      >
        {safeImageUrl ? (
          <img
            src={safeImageUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Icon className="h-6 w-6 text-[color:var(--accent-primary)]" strokeWidth={2.2} />
        )}
      </div>
      {/* Wraps between words, never inside one. `break-words hyphens-auto`
          let a name split mid-word ("Everyda-y Help") on the narrow home-page
          tiles, which is what made the row look broken. The fixed two-line box
          also keeps every tile in a row the same height regardless of whether
          its name wraps. */}
      {/* Two elements, not one: `line-clamp` needs `display:-webkit-box` on the
          text itself, so centring it with flex on the same element silently
          disables the clamp -- a long name then runs to four lines and makes
          its tile taller than the rest of the row. The wrapper owns the fixed
          height and centring; the inner element owns the clamp. */}
      <div
        className={`flex w-full items-center justify-center ${compact ? "min-h-[2rem]" : "min-h-[2.25rem]"}`}
      >
        <div
          className={`${compact ? "text-[12px]" : "text-[13px]"} line-clamp-2 font-medium leading-tight`}
        >
          {name}
        </div>
      </div>
    </Link>
  );
}

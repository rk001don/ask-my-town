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
      className={`tap-scale group flex flex-col items-center justify-center gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] text-center transition-colors duration-150 hover:border-[color:var(--accent-primary)] ${
        // A four-across tile is ~84px wide, so 12px of padding each side left
        // only 60px for the label -- narrower than a word like "Chocolates".
        // Tightening the compact tile buys back 8px without the tiles
        // touching. The roomier 3-column Explore grid keeps the larger inset.
        compact ? "px-2 py-3" : "p-3"
      }`}
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
          <Icon
            className="h-6 w-6 text-[color:var(--accent-primary)] transition-transform duration-150 group-hover:scale-110"
            strokeWidth={2.2}
          />
        )}
      </div>
      {/* Two elements, not one: `line-clamp` needs `display:-webkit-box` on the
          text itself, so centring it with flex on the same element silently
          disables the clamp and a long name runs to four lines, making its
          tile taller than the row. The wrapper owns the fixed height and the
          centring; the inner element owns the clamp.

          `w-full min-w-0` on the inner element is what keeps the text inside
          the tile. A flex child defaults to min-width:auto, so without it the
          clamped box sized itself to the longest word and overflowed the tile
          -- "Pharmacy & Care" rendered wider than its card and was cut to
          "Pharmac & Care".

          `overflow-wrap:break-word` is the safety net, not the mechanism: it
          wraps between words normally and only ever splits a word that cannot
          fit a line on its own, so a future long category name degrades to a
          wrap instead of being silently cut off. It is not `hyphens:auto`,
          which is what used to produce "Everyda-y Help" -- no hyphen is
          inserted. The names below are still sized to fit without it. */}
      <div
        className={`flex w-full items-center justify-center ${compact ? "min-h-[2rem]" : "min-h-[2.25rem]"}`}
      >
        <div
          className={`${compact ? "text-[12px]" : "text-[13px]"} line-clamp-2 w-full min-w-0 font-medium leading-tight [overflow-wrap:break-word]`}
        >
          {name}
        </div>
      </div>
    </Link>
  );
}

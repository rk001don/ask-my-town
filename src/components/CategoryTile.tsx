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
      <div
        className={`${compact ? "text-[12px]" : "text-[13px]"} w-full break-words hyphens-auto font-medium leading-tight line-clamp-2`}
      >
        {name}
      </div>
    </Link>
  );
}

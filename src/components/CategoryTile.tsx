import { Link } from "@tanstack/react-router";
import { iconFor } from "./icon-map";

type Props = {
  slug: string;
  name: string;
  iconKey?: string | null;
  compact?: boolean;
};

export function CategoryTile({ slug, name, iconKey, compact }: Props) {
  const Icon = iconFor(iconKey);
  return (
    <Link
      to="/c/$slug"
      params={{ slug }}
      className="tap-scale group flex flex-col items-center justify-center gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-3 text-center"
    >
      <div
        className={`grid place-items-center rounded-2xl ${compact ? "h-11 w-11" : "h-14 w-14"}`}
        style={{
          background:
            "linear-gradient(140deg, oklch(0.82 0.16 70 / 0.18), oklch(0.72 0.19 30 / 0.16))",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Icon className="h-6 w-6 text-[color:var(--accent-primary)]" strokeWidth={2.2} />
      </div>
      <div className={`${compact ? "text-[12px]" : "text-[13px]"} font-medium leading-tight line-clamp-2`}>
        {name}
      </div>
    </Link>
  );
}

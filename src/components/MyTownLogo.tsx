type MyTownLogoProps = {
  className?: string;
  showWordmark?: boolean;
};

export function MyTownLogo({ className = "h-10 w-10", showWordmark = false }: MyTownLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" role="img" aria-label="MyTown" className={className} focusable="false">
        <defs>
          <linearGradient id="mytown-m" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="#0b0d12" />
        <text
          x="32"
          y="43.5"
          textAnchor="middle"
          fontFamily="Sora, Inter, system-ui, sans-serif"
          fontSize="32"
          fontWeight="800"
          fill="url(#mytown-m)"
        >
          M
        </text>
      </svg>
      {showWordmark && (
        <div className="leading-none">
          <div className="text-display text-lg font-semibold">MyTown</div>
          <div className="text-[11px] text-[color:var(--text-muted)]">Need Anything?</div>
        </div>
      )}
    </div>
  );
}

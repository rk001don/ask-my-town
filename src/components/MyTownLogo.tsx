type MyTownLogoProps = {
  className?: string;
  showWordmark?: boolean;
};

export function MyTownLogo({ className = "h-11 w-11", showWordmark = false }: MyTownLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="MyTown"
        className={className}
        focusable="false"
      >
        <defs>
          <linearGradient
            id="mytown-pin"
            x1="10"
            x2="54"
            y1="8"
            y2="58"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fbbf24" />
            <stop offset="0.55" stopColor="#fb923c" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <path
          fill="url(#mytown-pin)"
          d="M32 4c-12.15 0-22 9.66-22 21.58 0 15.29 17.5 31.14 20.72 33.93a1.96 1.96 0 0 0 2.56 0C36.5 56.72 54 40.87 54 25.58 54 13.66 44.15 4 32 4Z"
        />
        <circle cx="32" cy="26" r="16" fill="rgba(15,23,42,.82)" />
        <text
          x="32"
          y="31"
          textAnchor="middle"
          fontFamily="Sora, Inter, system-ui, sans-serif"
          fontSize="16"
          fontWeight="800"
          letterSpacing="-1.5"
          fill="white"
        >
          MT
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

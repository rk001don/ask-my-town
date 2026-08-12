type MyTownLogoProps = {
  className?: string;
  showWordmark?: boolean;
};

// Renders the same static asset used for the favicon/PWA/apple-touch icons,
// instead of re-drawing the mark inline -- one source of truth, and no risk
// of the inline gradient defs silently failing to paint on some devices.
export function MyTownLogo({ className = "h-10 w-10", showWordmark = false }: MyTownLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/mytown-icon.svg?v=3"
        alt="MyTown"
        width={64}
        height={64}
        className={`${className} rounded-[22%] shadow-[0_2px_10px_rgba(0,0,0,0.35)]`}
      />
      {showWordmark && (
        <div className="leading-none">
          <div className="text-display text-lg font-semibold">MyTown</div>
          <div className="text-[11px] text-[color:var(--text-muted)]">Need Anything?</div>
        </div>
      )}
    </div>
  );
}

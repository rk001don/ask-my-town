import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Account control for the staff board and admin console.
 *
 * These headers were carrying a theme switcher and a sign-out button inline,
 * which on a phone-width staff board competed for space with the things the
 * shift actually needs -- the refresh control and the order count. Folding
 * them behind one profile icon gives that space back, and gives both screens
 * the same account affordance customers already have.
 */
export function StaffProfileMenu({
  email,
  roles,
  onSignOut,
  signingOut = false,
}: {
  email?: string | null;
  roles?: string[];
  onSignOut: () => void;
  signingOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape -- a menu that can only be dismissed
  // by hitting its own trigger again is a trap on a touch screen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full border border-[color:var(--border-strong)] p-2 hover:surface-subtle"
      >
        <User className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="sheet-in absolute right-0 top-[calc(100%+0.5rem)] z-[var(--z-modal)] w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-4 shadow-[var(--shadow-soft)]"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold">Signed in</div>
            <p className="mt-0.5 truncate text-xs text-[color:var(--text-secondary)]">
              {email ?? "—"}
            </p>
            {roles?.length ? (
              <p className="mt-1 truncate text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                {roles.join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="mt-3 border-t border-[color:var(--border-subtle)] pt-3">
            <div className="text-xs font-semibold text-[color:var(--text-secondary)]">
              Appearance
            </div>
            <div className="mt-2">
              <ThemeToggle />
            </div>
          </div>

          <button
            onClick={onSignOut}
            disabled={signingOut}
            className="tap-scale mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--border-strong)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

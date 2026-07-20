import { Link, useLocation } from "@tanstack/react-router";
import { Home, Compass, ClipboardList } from "lucide-react";
import { useCartCount } from "@/lib/cart-store";
import { AskFAB } from "@/components/AskFAB";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/activity", label: "Activity", icon: ClipboardList },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  // Hide bottom nav on employee board (different context)
  const hideNav = loc.pathname.startsWith("/employee");

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col">
      <main className={hideNav ? "flex-1" : "flex-1 pb-28"}>{children}</main>
      {!hideNav && (
        <>
          <AskFAB />
          <BottomNav pathname={loc.pathname} />
        </>
      )}
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const cartCount = useCartCount();
  return (
    <nav
      className="glass fixed bottom-3 left-1/2 z-40 w-[min(92vw,480px)] -translate-x-1/2 rounded-full px-2 py-2"
      aria-label="Primary"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="flex items-center justify-around gap-1">
        {TABS.map((t) => {
          const active =
            t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
          const badge = t.to === "/activity" ? 0 : 0; // placeholder for future
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                className="tap-scale relative flex flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2"
                style={{
                  color: active ? "var(--on-accent)" : "var(--text-secondary)",
                  background: active
                    ? "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))"
                    : "transparent",
                }}
                activeProps={{}}
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                <span className="text-[11px] font-semibold">{t.label}</span>
                {badge > 0 && (
                  <span className="absolute right-2 top-1 rounded-full bg-[color:var(--danger)] px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {cartCount > 0 && (
        <div className="pointer-events-none absolute -top-3 right-4 h-2 w-2 rounded-full bg-[color:var(--accent-primary)]" />
      )}
    </nav>
  );
}

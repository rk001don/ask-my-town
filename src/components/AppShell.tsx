import { Link, useLocation } from "@tanstack/react-router";
import { Home, Compass, ClipboardList, Store, ShoppingBag, ArrowRight } from "lucide-react";
import { AskFAB } from "@/components/AskFAB";
import { MyTownLogo } from "@/components/MyTownLogo";
import { useCart, useCartCount } from "@/lib/cart-store";
import type { ReactNode } from "react";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/activity", label: "Orders", icon: ClipboardList },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const hideNav =
    loc.pathname.startsWith("/employee") ||
    loc.pathname.startsWith("/staff") ||
    loc.pathname.startsWith("/admin");

  const showFloatingCart =
    !hideNav &&
    !loc.pathname.startsWith("/cart") &&
    !loc.pathname.startsWith("/checkout") &&
    !loc.pathname.startsWith("/order/") &&
    !loc.pathname.startsWith("/auth") &&
    // The orders screen is about tracking, not buying: stacking a cart pill on
    // top of the order cards there just covered content people came to read.
    !loc.pathname.startsWith("/activity") &&
    !loc.pathname.startsWith("/my-orders");

  const showBottomNav =
    !loc.pathname.startsWith("/cart") &&
    !loc.pathname.startsWith("/checkout") &&
    !loc.pathname.startsWith("/order/") &&
    !loc.pathname.startsWith("/auth") &&
    !loc.pathname.startsWith("/my-orders");

  const cartCount = useCartCount();
  // The floating cart bar and the Ask FAB both live in the bottom-right
  // corner on mobile -- when the cart bar is actually rendered, lift the FAB
  // above it instead of letting the two collide.
  const cartBarVisible = showFloatingCart && cartCount > 0;

  if (hideNav) {
    return <div className="min-h-[100dvh] w-full">{children}</div>;
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col md:max-w-none md:flex-row">
      <aside className="sticky top-0 hidden h-[100dvh] w-56 flex-shrink-0 border-r border-[color:var(--border-subtle)] px-3 py-6 md:flex md:flex-col">
        <Link to="/" aria-label="MyTown home" className="tap-scale block px-2">
          <MyTownLogo className="h-8 w-8" showWordmark />
        </Link>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Primary">
          {TABS.map((t) => {
            const active = t.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="tap-scale flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold"
                style={{
                  color: active ? "var(--on-accent)" : "var(--text-secondary)",
                  background: active
                    ? "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))"
                    : "transparent",
                }}
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 text-xs text-[color:var(--text-tertiary)]">
          <Store className="mb-1 h-4 w-4" /> Karimangalam & nearby
        </div>
      </aside>

      <div className="relative flex min-h-[100dvh] w-full flex-1 flex-col md:max-w-4xl md:mx-auto">
        <main
          className={`flex-1 ${cartBarVisible ? "pb-[calc(10rem+env(safe-area-inset-bottom))]" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]"} md:pb-10`}
        >
          {children}
        </main>
        <AskFAB hideMobileTrigger={cartBarVisible} />
        {cartBarVisible && <MobileCartBar />}
        {showBottomNav && (
          <div className="md:hidden">
            <BottomNav pathname={loc.pathname} />
          </div>
        )}
      </div>
    </div>
  );
}

function MobileCartBar() {
  const cartCount = useCartCount();
  const { items } = useCart();

  if (cartCount === 0) return null;

  const total = items.reduce(
    (sum: number, item: { unitPrice?: number | null; quantity: number }) => {
      const unitPrice = item.unitPrice ?? 0;
      return sum + unitPrice * item.quantity;
    },
    0,
  );

  return (
    <div
      className="fixed inset-x-0 z-[var(--z-overlay)] px-3 md:hidden"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
    >
      <Link
        to="/cart"
        className="tap-scale accent-gradient mx-auto flex max-w-[480px] items-center justify-between gap-3 rounded-2xl px-4 py-3.5 shadow-[0_12px_28px_-6px_rgba(0,0,0,0.5)]"
      >
        <div className="flex min-w-0 items-center gap-2.5 text-[color:var(--on-accent)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/15">
            <ShoppingBag className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">
              {cartCount} item{cartCount === 1 ? "" : "s"} · ₹{total}
            </div>
            <div className="text-[11px] font-medium opacity-80">Tap to review your order</div>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/15 px-3.5 py-2 text-xs font-bold text-[color:var(--on-accent)]">
          View cart <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="glass fixed bottom-3 left-1/2 z-[var(--z-nav)] w-[min(92vw,480px)] -translate-x-1/2 rounded-full px-2 py-2"
      aria-label="Primary"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="flex items-center justify-around gap-1">
        {TABS.map((t) => {
          const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
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
              >
                <Icon className="h-5 w-5" strokeWidth={2.2} />
                <span className="text-[11px] font-semibold">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

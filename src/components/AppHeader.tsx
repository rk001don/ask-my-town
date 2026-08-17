import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Search as SearchIcon, ShoppingBag, User } from "lucide-react";
import { MyTownLogo } from "./MyTownLogo";
import { useCartCount } from "@/lib/cart-store";
import { waLink } from "@/lib/constants";
import { useEffect, useRef, useState } from "react";

type Props = {
  title?: string;
  showBack?: boolean;
  showSearch?: boolean;
  showChat?: boolean;
  showCart?: boolean;
  transparent?: boolean;
};

export function AppHeader({
  title,
  showBack = true,
  showSearch = true,
  showChat = false,
  showCart = true,
  transparent = false,
}: Props) {
  const cartCount = useCartCount();
  const navigate = useNavigate();
  const loc = useLocation();
  const [bump, setBump] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Publish the header's real height so anything sticking beneath it (the
  // category filter bar) can offset correctly. It isn't a fixed number: a long
  // category name wraps to two lines and makes the header taller, so a
  // hardcoded offset would either overlap or leave a gap.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () =>
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (cartCount === 0) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 450);
    return () => clearTimeout(t);
  }, [cartCount]);
  // Imported lazily on purpose. AppHeader renders on every page, so a static
  // import pulled the whole Supabase client (~300 kB) into the shared bundle
  // that every visitor downloads -- including someone browsing the menu who
  // never signs in. The header only needs it to decide whether to show the
  // account icon, which can happen a beat later.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (cancelled) return;
      supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
      unsubscribe = () => sub.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-[var(--z-header)] flex items-center justify-between gap-2 px-4 py-3 ${transparent ? "" : "glass"}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {showBack && (
          <button
            aria-label="Back"
            onClick={() => (history.length > 1 ? history.back() : navigate({ to: "/" }))}
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {title ? (
          <h1 className="text-display line-clamp-2 text-base leading-tight font-semibold">
            {title}
          </h1>
        ) : (
          <Link to="/" aria-label="MyTown home" className="tap-scale rounded-2xl">
            <MyTownLogo className="h-9 w-9" />
          </Link>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showSearch && (
          <Link
            to="/search"
            aria-label="Search"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <SearchIcon className="h-5 w-5" />
          </Link>
        )}
        {showChat && (
          <a
            href={waLink()}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Chat on WhatsApp"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
        )}
        {/* Signing in from the header used to drop people on the home screen
            whatever they were doing -- the single most common way to lose your
            place in the app. The current path rides along so auth can put them
            back exactly where they were. */}
        {signedIn ? (
          <Link
            to="/activity"
            aria-label="My orders"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <User className="h-5 w-5" />
          </Link>
        ) : (
          <Link
            to="/auth"
            search={{ redirect: `${loc.pathname}${loc.searchStr ?? ""}` }}
            aria-label="Sign in"
            className="tap-scale grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <User className="h-5 w-5" />
          </Link>
        )}
        {showCart && (
          <Link
            to="/cart"
            aria-label="Cart"
            className="tap-scale relative grid min-h-11 min-w-11 place-items-center rounded-full p-2 hover:surface-subtle"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span
                className={`absolute -right-1 -top-1 min-w-[18px] rounded-full accent-gradient px-1 text-center text-[11px] font-bold leading-[18px] ${bump ? "badge-bounce" : ""}`}
              >
                {cartCount}
              </span>
            )}
          </Link>
        )}
      </div>
    </header>
  );
}

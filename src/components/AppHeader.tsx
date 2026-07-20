import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search as SearchIcon, ShoppingBag } from "lucide-react";
import { useCartCount } from "@/lib/cart-store";
import { useEffect, useState } from "react";

type Props = {
  title?: string;
  showBack?: boolean;
  showSearch?: boolean;
  showCart?: boolean;
  transparent?: boolean;
};

export function AppHeader({
  title,
  showBack = true,
  showSearch = true,
  showCart = true,
  transparent = false,
}: Props) {
  const cartCount = useCartCount();
  const navigate = useNavigate();
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (cartCount === 0) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 450);
    return () => clearTimeout(t);
  }, [cartCount]);

  return (
    <header
      className={`sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-3 ${transparent ? "" : "glass"}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {showBack && (
          <button
            aria-label="Back"
            onClick={() => history.length > 1 ? history.back() : navigate({ to: "/" })}
            className="tap-scale rounded-full p-2 hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {title && (
          <h1 className="text-display truncate text-lg font-semibold">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showSearch && (
          <Link
            to="/search"
            aria-label="Search"
            className="tap-scale rounded-full p-2 hover:bg-white/5"
          >
            <SearchIcon className="h-5 w-5" />
          </Link>
        )}
        {showCart && (
          <Link
            to="/cart"
            aria-label="Cart"
            className="tap-scale relative rounded-full p-2 hover:bg-white/5"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span
                className={`absolute right-0 top-0 min-w-[18px] rounded-full accent-gradient px-1 text-center text-[11px] font-bold ${bump ? "badge-bounce" : ""}`}
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

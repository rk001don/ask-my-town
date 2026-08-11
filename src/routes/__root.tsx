import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="max-w-md text-center rise">
        <div className="text-display text-7xl">404</div>
        <p className="mt-3 text-lg text-[color:var(--text-secondary)]">Can't find that page.</p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-full accent-gradient px-6 py-3 font-semibold tap-scale"
        >
          Back home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="max-w-md text-center rise">
        <h1 className="text-display text-2xl">Something didn't load</h1>
        <p className="mt-2 text-[color:var(--text-secondary)]">A hiccup on our end. Try again.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full accent-gradient px-5 py-2.5 font-semibold tap-scale"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-[color:var(--border-strong)] px-5 py-2.5 font-medium tap-scale"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1a1a1f" },
      { title: "MyTown — Need Anything? MyTown!" },
      {
        name: "description",
        content:
          "Hyperlocal assisted commerce for Karimangalam & nearby areas. Just tell us what you need — food, groceries, tickets, rentals, local help — MyTown handles the rest.",
      },
      { name: "author", content: "MyTown" },
      { property: "og:title", content: "MyTown — Need Anything? MyTown!" },
      {
        property: "og:description",
        content:
          "Hyperlocal assisted commerce for Karimangalam & nearby areas. Just tell us what you need — food, groceries, tickets, rentals, local help — MyTown handles the rest.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "MyTown" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "MyTown" },
      { name: "twitter:title", content: "MyTown — Need Anything? MyTown!" },
      {
        name: "twitter:description",
        content:
          "Hyperlocal assisted commerce for Karimangalam & nearby areas. Just tell us what you need — food, groceries, tickets, rentals, local help — MyTown handles the rest.",
      },
      {
        property: "og:image",
        content: "/icon-512.png",
      },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      {
        name: "twitter:image",
        content: "/icon-512.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/mytown-icon.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter+Tight:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    // Lazy import so SSR doesn't touch localStorage.
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (cancelled) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      // stash for cleanup
      (window as unknown as { __mtAuthSub?: { unsubscribe: () => void } }).__mtAuthSub =
        data.subscription;
    });
    return () => {
      cancelled = true;
      (
        window as unknown as { __mtAuthSub?: { unsubscribe: () => void } }
      ).__mtAuthSub?.unsubscribe();
    };
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
          },
        }}
      />
    </QueryClientProvider>
  );
}

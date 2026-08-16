import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Keep fetched screens in memory for 5 minutes so going
        // home -> category -> back re-renders from cache instead of
        // re-fetching. On the slow mobile connections this app is actually
        // used on, that back-navigation is the difference between instant
        // and a visible spinner.
        gcTime: 5 * 60_000,
        // One automatic retry: a single dropped request on a flaky connection
        // recovers silently instead of showing an error state. More than one
        // just makes a genuine failure take longer to report.
        retry: 1,
        retryDelay: 500,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a route as soon as there's *intent* to go there -- hover on
    // desktop, touchstart on mobile -- so the data is usually already in flight
    // (often finished) by the time the tap completes. Without this, every
    // navigation began its fetch only after the click landed, which is a large
    // part of why moving between screens felt sluggish.
    defaultPreload: "intent",
    // Don't re-fetch a route that was preloaded moments ago: treat preloaded
    // data as fresh for the same 30s window as everything else. The previous
    // value of 0 meant every preload was immediately considered stale, so the
    // real navigation fetched all over again and the preload bought nothing.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};

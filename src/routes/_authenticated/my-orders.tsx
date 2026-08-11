import { createFileRoute, redirect } from "@tanstack/react-router";

// "My orders" now lives at /activity (the same page the bottom-nav "Orders"
// tab uses, for both guests and signed-in customers) -- this route is kept
// only so old links/bookmarks to /my-orders keep working.
export const Route = createFileRoute("/_authenticated/my-orders")({
  beforeLoad: () => {
    throw redirect({ to: "/activity" });
  },
});

import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Server functions are POST endpoints that run with the caller's session
// cookie, so without this any other site could make a visitor's browser place
// an order, link an account, or hit a staff action. TanStack Start warns about
// exactly this on every dev boot; it was never wired up.
//
// The `filter` matters. This middleware runs on EVERY request, not just server
// functions, and its default check rejects anything whose Sec-Fetch-Site is
// not same-origin -- which is precisely what a normal inbound link looks like.
// Guarding page loads with it would 403 every customer arriving from a
// WhatsApp order link. Only unsafe methods carry CSRF risk, so only those are
// checked: cross-site navigation still works, cross-site POST does not.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ request }) => !SAFE_METHODS.has(request.method.toUpperCase()),
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // CSRF first so a forged request is rejected before it reaches anything.
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));

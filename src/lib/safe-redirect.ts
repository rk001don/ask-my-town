/**
 * Resolve a `redirect` search param into a path we are willing to navigate to.
 *
 * Two jobs. It normalises a full href -- the authenticated-route guard passes
 * `location.href`, which router.navigate treats as a literal path and cannot
 * resolve -- and it refuses anything that is not a same-origin path, so the
 * parameter cannot be used to bounce someone to another site after they sign
 * in. That second job is why this lives in its own module with its own tests:
 * an unvalidated redirect param is a real open-redirect vector, and it is fed
 * straight into both `navigate()` and the OAuth `redirectTo`.
 *
 * `origin` is injectable so the rule can be tested without a browser.
 */
export function safeRedirect(
  raw: string | undefined | null,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): string {
  if (!raw || !origin) return "/";
  try {
    // Resolving against our own origin makes "//evil.com" and
    // "https://evil.com" both surface a foreign origin, which we then reject.
    const url = new URL(raw, origin);
    if (url.origin !== origin) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Never bounce back to the sign-in screen itself.
    return path.startsWith("/auth") ? "/" : path || "/";
  } catch {
    return "/";
  }
}

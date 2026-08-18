import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Security response headers. Nothing was setting these, so the deployed app
// shipped with browser defaults: framable, MIME-sniffable, and leaking the
// full URL (which carries an order ID) in the Referer of every outbound link.
//
// Applied on the production build only. `vite dev` is what Lovable's preview
// iframes, and frame-ancestors would break that while protecting nothing --
// there is no attack surface on a localhost dev server.
//
// Deliberately no Content-Security-Policy yet: TanStack Start hydrates via an
// inline script, so a CSP without nonce plumbing would need 'unsafe-inline'
// for scripts and would be security theatre. That is a real follow-up, not
// something to fake here.
const SECURITY_HEADERS: [string, string][] = [
  // Stop the browser second-guessing our content types -- the classic route
  // to turning an uploaded image into executable script.
  ["x-content-type-options", "nosniff"],
  // Clickjacking: nothing in this app is meant to be framed by another site.
  ["x-frame-options", "DENY"],
  // Order pages are /order/MT-XXXXXX. Sending that path to WhatsApp (or any
  // outbound link) as a Referer hands the order ID to a third party.
  ["referrer-policy", "strict-origin-when-cross-origin"],
  // We ask for notification permission and nothing else.
  ["permissions-policy", "geolocation=(), camera=(), microphone=(), payment=(), usb=()"],
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
];

function withSecurityHeaders(response: Response): Response {
  if (!import.meta.env.PROD) return response;
  // A Response's headers are immutable once it has been constructed by some
  // handlers, so clone rather than mutate in place.
  const headers = new Headers(response.headers);
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};

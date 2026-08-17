// Shared error plumbing for the whole app.
//
// The problem this solves: server functions used to `throw new Error(dbErr.message)`,
// which put raw Postgres/PostgREST text ("duplicate key value violates unique
// constraint orders_pkey", "failed to parse logic tree ...") straight into a
// customer-facing toast. That's confusing for the customer and leaks schema
// details to anyone poking at the app.
//
// The model is an ALLOWLIST, deliberately: a message is shown to a person only
// if some human wrote it for a person. Everything else -- database errors,
// network blips, bugs -- collapses to a friendly generic line, and the real
// error is logged server-side where we can actually read it.
//
// Failing this way round matters: a missed annotation degrades to a slightly
// vaguer message (harmless), whereas a denylist that misses one pattern leaks
// raw internals (not harmless).

/**
 * Marker prefix identifying a message as written for a human.
 *
 * A prefix (rather than a custom Error subclass or extra property) is used on
 * purpose: server-function errors are serialized across the network boundary,
 * which drops classes and non-standard properties but always preserves
 * `message`.
 */
const USER_MESSAGE_PREFIX = "MTUSER:";

/**
 * Marks a message as safe to show to the person using the app.
 * Use for anything actionable: validation failures, rate limits, "not found",
 * permission messages -- text you'd be happy to read as a customer.
 */
export function userError(message: string): Error {
  return new Error(`${USER_MESSAGE_PREFIX}${message}`);
}

/** True when `err` carries a message deliberately written for a person. */
export function isUserError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith(USER_MESSAGE_PREFIX);
}

/**
 * Unwraps an error into something safe to display.
 *
 * Marked messages are returned verbatim (minus the marker); everything else
 * returns `fallback`, so raw database/network text can never reach a toast.
 */
export function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.startsWith(USER_MESSAGE_PREFIX)) {
    return err.message.slice(USER_MESSAGE_PREFIX.length);
  }
  return fallback;
}

/**
 * Server-side: log the real failure, then throw a clean message for the client.
 *
 * `context` is a short label for the log ("createOrder.insertOrder") so a
 * report of "it failed" can be traced in the Vercel logs without the customer
 * ever seeing the underlying error.
 */
export function failFrom(
  context: string,
  cause: { message?: string; code?: string } | unknown,
  userFacing: string,
): never {
  const detail =
    cause && typeof cause === "object" && "message" in cause
      ? `${(cause as { code?: string }).code ?? ""} ${(cause as { message?: string }).message ?? ""}`.trim()
      : String(cause);
  console.error(`[${context}] ${detail}`);
  throw userError(userFacing);
}

/**
 * Runs a Zod schema and converts a failure into a displayable message.
 *
 * Validation failures are the one class of error that is inherently about the
 * customer's own input, so the schema's message is exactly what they need to
 * read. Without this they'd be thrown as a bare ZodError -- unmarked, and so
 * collapsed to a generic fallback by `toUserMessage`, which is how a carefully
 * written rule like "You can order up to 50 of one item" would never actually
 * reach anyone.
 *
 * Only the first issue is surfaced: a list of six complaints is a worse
 * experience than one clear thing to fix.
 */
export function parseOrUserError<T>(
  schema: { parse: (data: unknown) => T },
  data: unknown,
  fallback = "Please check the details and try again.",
): T {
  try {
    return schema.parse(data);
  } catch (err) {
    const issues = (err as { issues?: { message?: string }[] })?.issues;
    const first = Array.isArray(issues) ? issues[0]?.message : undefined;
    throw userError(first && first.trim() ? first : fallback);
  }
}

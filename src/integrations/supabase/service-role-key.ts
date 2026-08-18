/**
 * Detect the "admin" Supabase client silently not being an admin.
 *
 * `client.server.ts` documents itself as bypassing RLS, and every server
 * function trusts that. But the client is built from whatever string is in
 * SUPABASE_SERVICE_ROLE_KEY -- and if that string is a *publishable* key, the
 * client still constructs, still connects, and still answers queries. It just
 * answers them as `anon`.
 *
 * That failure is close to invisible. Catalogue reads keep working, because
 * anon can read them under RLS, so the app looks healthy; only genuinely
 * privileged calls fail. The rate limiter is the clearest case -- it is
 * REVOKEd from anon, so `mytown_check_rate_limit` returns 42501 and both
 * order tracking and checkout die at the gate. This was real: the key in
 * .env.local was a publishable key, and every local order lookup failed with
 * "permission denied for function mytown_check_rate_limit".
 *
 * This reports rather than throws, deliberately. A wrong key here is a LOSS of
 * privilege, not a privilege escalation -- there is no security argument for
 * failing closed. And if a deployment ever did have the wrong key, throwing
 * would turn a partial outage (browsing works, ordering does not) into a total
 * one. A loud startup error surfaces the misconfiguration without that risk.
 */

/**
 * Returns a description of what is wrong with the key, or undefined when it
 * looks fine. Only the two cases we can be certain about are reported --
 * an unrecognised format is treated as valid, because crying wolf about a
 * future key format would train people to ignore this.
 */
export function describeServiceRoleKeyProblem(key: string): string | undefined {
  if (key.startsWith("sb_publishable_")) return "a publishable key";
  if (decodeJwtRole(key) === "anon") return "an anon key";
  return undefined;
}

/** The startup message, kept next to the check so they cannot drift apart. */
export function serviceRoleKeyWarning(problem: string): string {
  return (
    `[Supabase] SUPABASE_SERVICE_ROLE_KEY is ${problem}, not a service-role key. ` +
    `The server is running with ANON privileges: ordinary reads will work, but privileged ` +
    `calls such as mytown_check_rate_limit fail with "permission denied", which breaks order ` +
    `tracking and checkout. Set the secret key (sb_secret_...) from Supabase > Project ` +
    `Settings > API.`
  );
}

function decodeJwtRole(key: string): string | undefined {
  const parts = key.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return typeof json.role === "string" ? json.role : undefined;
  } catch {
    return undefined;
  }
}

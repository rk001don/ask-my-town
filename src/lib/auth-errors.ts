// Supabase Auth's SDK errors are written for developers ("email rate limit
// exceeded", "Invalid login credentials", raw "AuthApiError: ..." text).
// Shared by every sign-in surface (customer /auth, staff /staff) so nobody
// sees a raw SDK string in a toast -- map the common ones to something a
// person can actually act on, and otherwise fall back to a plain generic
// message instead of leaking SDK internals.
export function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const msg = raw.toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (msg.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (msg.includes("rate limit")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (msg.includes("email") && msg.includes("invalid")) {
    return "Enter a valid email address.";
  }
  if (msg.includes("password") && msg.includes("character")) {
    return "Password must be at least 6 characters.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "Network issue — check your connection and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

// Resolve the caller's auth user *if* they happen to be signed in.
//
// `requireSupabaseAuth` (the generated middleware) is all-or-nothing: it throws
// when there's no valid bearer token. That's right for account endpoints, but
// wrong for checkout, which must work for guests and yet still needs to know
// when the caller is signed in -- otherwise a signed-in customer's order is
// matched to a customer record by phone number alone, which is exactly how one
// person's order ended up under another person's account.
//
// Never throws. A missing, malformed or expired token means "guest", which is
// the safe reading: the worst case is an order recorded as a guest order,
// claimable afterwards with its order ID.
import { getRequest } from "@tanstack/react-start/server";

export async function getOptionalUserId(): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice("Bearer ".length).trim();
    // A Supabase access token is a JWT; anything else can't be verified and is
    // treated as absent rather than passed to the auth server.
    if (!token || token.split(".").length !== 3) return null;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verifies the signature -- a forged `sub` can't get through here, so this
    // is safe to use as an identity for attaching orders.
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}

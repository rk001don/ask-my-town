# own-mytown branch — standalone / self-hosted version

This branch removes the one real Lovable-platform dependency in the app
(everything else in this repo is standard TanStack Start + Supabase code
that works the same whether hosted by Lovable or by you):

## What changed vs `main`

- **Google sign-in no longer goes through Lovable's own OAuth broker**
  (`@lovable.dev/cloud-auth-js`). It now calls Supabase's own
  `supabase.auth.signInWithOAuth({ provider: 'google' })` directly.
  Lovable's broker is tied to Lovable's own infrastructure and would not
  work once this app is hosted outside Lovable — this was the one change
  that was actually necessary, not just cosmetic.
- `src/integrations/lovable/` (the broker wrapper) and the
  `@lovable.dev/cloud-auth-js` dependency are removed.

## What was deliberately left alone

- `@lovable.dev/vite-tanstack-config` in `vite.config.ts` — **kept on
  purpose**. Vercel's own docs confirm this package is specifically what
  enables zero-configuration TanStack Start deployment on Vercel; removing
  it would make deployment *harder*, not more independent.
- `src/lib/lovable-error-reporting.ts` — harmless outside Lovable's
  environment. It only writes to `window.__lovableEvents`, which is
  `undefined` anywhere else, so every call is a safe no-op.

## Before this branch will actually work

You must:
1. Point `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (and the service role
   key used server-side) at your **own** Supabase project, not Lovable
   Cloud's.
2. Enable Google as an Auth provider directly in **your own** Supabase
   project's Authentication → Providers settings, with your own Google
   Cloud OAuth client ID/secret — Lovable's built-in Google auth does not
   carry over to a self-managed Supabase project either way, so this step
   is required regardless of this branch's changes.
3. Run every file in `supabase/migrations/`, in order, against your new
   project.

See the accompanying step-by-step guide for the full setup checklist.

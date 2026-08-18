# Environments: preprod vs production

## The problem this solves

Today there is one Supabase project, and it is production. Vercel gives every
branch a Preview URL (`mytown-git-<branch>-…vercel.app`), but those previews
point at the **same** production database through the same env vars. So a
preview is a preview of the *code* only — any order placed, any account created
while testing writes straight into prod. There is no safe place to rehearse.

"Preprod" fixes that by giving the preview code its own database.

## The shape

```
 branch push ──▶ Vercel Preview  ──▶  Supabase PREPROD   (safe to break)
                       │
                    merge to main
                       ▼
                 Vercel Production ──▶  Supabase PROD     (real customers)
```

Two Supabase projects, same schema. Vercel picks which one by *environment
scope* (Preview vs Production), so the same code hits different data depending
on how it was deployed.

## One-time setup

### 1. Create the preprod Supabase project
Supabase Dashboard → New project → name it `mytown-preprod`. Same region as
prod. Note its URL, publishable key, secret (service-role) key, and the
connection string (`SUPABASE_DB_URL`).

### 2. Put the schema on it
From a checkout of `main`:
```bash
supabase db push --db-url "<PREPROD_DB_URL>"
```
That replays every migration in `supabase/migrations/` onto the empty project,
so preprod and prod start structurally identical.

Optionally wire this into CI: `db-sync.yml` currently pushes migrations to prod
(`SUPABASE_DB_URL`) on merge to main. Add a second step that pushes the same
migrations to `SUPABASE_DB_URL_PREPROD` on branch pushes, so preprod stays in
sync automatically. (Ask and I'll write it — it needs the preprod secret added
in GitHub → Settings → Secrets.)

### 3. Point Vercel Preview at preprod
Vercel → Project → Settings → Environment Variables. Vercel scopes each var to
**Production**, **Preview**, and **Development** independently. Set, scoped to
**Preview** only:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | preprod URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | preprod publishable key |
| `VITE_SUPABASE_PROJECT_ID` / `SUPABASE_PROJECT_ID` | preprod project id |
| `SUPABASE_SERVICE_ROLE_KEY` | preprod **secret** key |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | a preprod VAPID pair |

Leave the **Production**-scoped vars pointing at prod. Do not rely on the
committed `.env` for preview — a Preview-scoped var overrides it.

> Note: the repo's `.env` holds prod's *publishable* values (safe to commit —
> they ship in the browser bundle anyway). The service-role and VAPID-private
> keys are never committed; they live only in Vercel and in local `.env.local`.

## Day-to-day flow (how to "ensure on preprod without touching prod")

1. Work on a branch. Push it.
2. Open the Vercel **Preview** URL for that branch → it runs against preprod.
   Place test orders, sign up, break things freely.
3. When it's right, merge to `main`. That — and only that — deploys to
   **Production** and runs migrations against prod.

Nothing reaches prod data until a merge to main. That is the guarantee you
asked for.

## The data wipe

`supabase/scripts/fresh-start-wipe.sql` clears end-user/order/notification data
for a clean launch. Run it in the Supabase SQL editor **on preprod first** — it
is a dry run by default (rolls back, prints counts). Rehearse there, confirm the
numbers, then run it on prod (switching `ROLLBACK;` to `COMMIT;`) as the last
step before go-live.

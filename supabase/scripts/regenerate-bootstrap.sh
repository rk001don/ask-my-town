#!/usr/bin/env bash
# Regenerate supabase/schema/bootstrap.sql so it can never silently drift from
# what supabase/migrations/*.sql actually produces.
#
# WHY THIS EXISTS
#
# bootstrap.sql was a one-time, hand-written snapshot ("Generated ... on
# 2026-08-12", per its own header) meant to let someone stand up a fresh
# Supabase project in one paste instead of replaying 40+ migration files by
# hand. It was never regenerated after that day, so every migration since
# stopped being reflected in it -- most importantly a later migration
# (20260814060000_drop_legacy_unused_tables.sql) DROPPED group_orders, staff,
# riders and employees, none of which bootstrap.sql knew about. Anyone
# reading bootstrap.sql after that point -- including an agent -- would
# reasonably conclude those tables still exist. They don't, on any database
# that has actually run the real migrations in supabase/migrations/.
#
# bootstrap.sql is NOT what keeps a real environment in sync -- that's
# .github/workflows/db-sync.yml, which runs `supabase db push` against the
# live project on every merge to main and has been working correctly the
# whole time (check the Actions tab, workflow "Sync Supabase schema").
# bootstrap.sql is only a reference snapshot for someone spinning up a
# brand-new project from scratch, and it drifts the moment a migration is
# added without this script being re-run -- there's no automatic trigger,
# by design, so it only regenerates when someone actually asks for it.
#
# WHAT IT DOES
#
# The original bootstrap.sql was a literal CONCATENATION of the migration
# files in order, each preceded by a "-- Source: <filename>" marker (37 of
# them, one per migration that existed on the day it was written) -- not a
# pg_dump. That matters: pg_dump's default data format is `COPY ... FROM
# STDIN`, which needs psql's client-side handling of the following raw data
# lines and the terminating `\.` -- pasting that into a plain SQL-execution
# box (like Supabase's SQL Editor, which this file is explicitly for) is not
# guaranteed to work the way running it through `psql -f` does. The
# migrations themselves already use ordinary INSERT/CREATE/ALTER statements,
# which paste and run anywhere, so concatenation is both the simpler
# mechanism and the more portable one. This script keeps doing that.
#
# What a straight concatenation can't tell you is whether the result is
# actually valid SQL end-to-end -- migration 30 could assume something
# migration 12 no longer provides, and nothing would catch that until it hit
# a real database. So the concatenation is VALIDATED by replaying it for
# real:
#   1. Starts a throwaway local Postgres (deleted at the end either way)
#   2. Stubs just enough of Supabase's own setup for the migrations to run
#      (the anon/authenticated/service_role/supabase_auth_admin roles, an
#      `auth` schema with `auth.users` and stand-ins for auth.uid()/
#      auth.jwt()/auth.role(), and the pgcrypto extension)
#   3. Applies every file in supabase/migrations/, in filename order --
#      exactly what `supabase db push` does against the real project
#   4. Only if every file applied cleanly (see the storage-schema exception
#      below), concatenates the same files, in the same order, into
#      supabase/schema/bootstrap.sql with a fresh header and per-file
#      "-- Source:" markers
#
# Three pre-existing failures are EXPECTED and do not stop the script: they
# come from migrations that reference Supabase's `storage` schema, which
# isn't stubbed here because nothing in the app schema depends on it. Any
# OTHER failure is real and the script stops and reports it -- that's the
# actual point of running this: it would have caught the group_orders/staff
# drop being silently missed from a hand-maintained snapshot before anyone
# got misled by reading it.
#
# USAGE
#   supabase/scripts/regenerate-bootstrap.sh
# Works whether run as your own user or as root (it drops to the `postgres`
# system user for the Postgres commands either way, matching how a CI
# container or a root shell needs to run initdb).
#
# REQUIRES: postgresql server binaries (initdb, pg_ctl, psql, pg_dump) on
# PATH or under /usr/lib/postgresql/*/bin, and the `postgres` system user to
# exist if run as root. Nothing else -- it never touches a real Supabase
# project.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
OUT_FILE="$REPO_ROOT/supabase/schema/bootstrap.sql"

PGBIN="$(command -v initdb >/dev/null 2>&1 && dirname "$(command -v initdb)" || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "error: couldn't find PostgreSQL server binaries (initdb). Install postgresql-server." >&2
  exit 1
fi

PGPORT=55499
# initdb refuses to run as root regardless of directory permissions, so a
# root shell (this environment; also a plausible CI container) has to drop
# to the `postgres` system user for every Postgres command. A non-root shell
# runs them directly -- there's nothing to drop to, and typically no
# `postgres` system user to drop to anyway.
if [ "$(id -u)" = "0" ]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "error: running as root, but no 'postgres' system user exists to drop to." >&2
    exit 1
  fi
  WORK="/var/lib/postgresql/regen-bootstrap-$$"
  mkdir -p "$WORK"
  chown postgres:postgres "$WORK"
  chmod 700 "$WORK"
  run_pg() { su postgres -c "$*"; }
else
  WORK="$(mktemp -d)"
  run_pg() { bash -c "$*"; }
fi
PGDATA="$WORK/data"

cleanup() {
  run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -m fast stop" >/dev/null 2>&1 || true
  if [ "$(id -u)" = "0" ]; then rm -rf "$WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

echo "==> Starting a throwaway Postgres in $WORK"
run_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres" >/dev/null
run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -o '-p $PGPORT -k $WORK' -l '$WORK/log' start" >/dev/null
sleep 1
PSQL="psql -h $WORK -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"

echo "==> Stubbing the Supabase roles/schema the migrations expect"
$PSQL <<'SQL'
create extension if not exists pgcrypto;
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login createrole; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'anon'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema auth to service_role;
SQL

echo "==> Replaying every migration in filename order"
fail_count=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"
  out="$($PSQL -f "$f" 2>&1)" || true
  if echo "$out" | grep -qi "^psql:.*ERROR\|^ERROR:"; then
    if echo "$out" | grep -qi 'schema "storage" does not exist\|relation "storage\.'; then
      echo "    (expected, storage schema not stubbed) $name"
    else
      echo "!!  UNEXPECTED FAILURE in $name:"
      echo "$out" | grep -i "ERROR" | sed 's/^/    /'
      fail_count=$((fail_count + 1))
    fi
  fi
done

if [ "$fail_count" -gt 0 ]; then
  echo "==> $fail_count migration(s) failed for a reason other than the storage schema. Not regenerating bootstrap.sql -- fix the migration history first."
  exit 1
fi

echo "==> Concatenating the validated migrations into bootstrap.sql"
{
  echo "-- Consolidated bootstrap schema for ask-my-town"
  echo "-- Regenerated by supabase/scripts/regenerate-bootstrap.sh from supabase/migrations/*.sql on $(date -u +%Y-%m-%d)."
  echo "-- Run this ONCE against a fresh/empty Supabase project via the SQL Editor."
  echo "-- Do NOT run this against a database that already has these migrations applied."
  echo "--"
  echo "-- This file does not drive any real environment -- .github/workflows/db-sync.yml"
  echo "-- applies supabase/migrations/*.sql directly to the live project on every merge"
  echo "-- to main. This is a snapshot for standing up a NEW project from scratch, and it"
  echo "-- only reflects reality as of the last time this script was run -- regenerate it"
  echo "-- again after adding migrations if you want it current."
  for f in "$MIGRATIONS_DIR"/*.sql; do
    echo
    echo "-- ===================================================================="
    echo "-- Source: $(basename "$f")"
    echo "-- ===================================================================="
    cat "$f"
  done
} > "$OUT_FILE"

echo "==> Wrote $OUT_FILE"

# RLS blind-rule verification (no Docker required)

Proves THE ONE RULE — *a member can read others' scores only when the reveal
session is `revealed`* — by applying the real migration to a local PostgreSQL
and running ten assertions as three different authenticated users.

This exists because the full Supabase stack (`npx supabase start`) needs
Docker. RLS itself is plain PostgreSQL, so the policies can be proven against
the portable Postgres binaries instead. `00-stubs.sql` provides minimal
stand-ins for what the Supabase platform normally supplies (`auth.users`,
`auth.uid()`, the `anon`/`authenticated` roles); the migration then runs
**verbatim**.

## One-time setup (portable Postgres, no admin rights)

```powershell
# 1. Download + extract the EDB "binaries only" zip (no installer, no service)
curl.exe -o pg17.zip https://get.enterprisedb.com/postgresql/postgresql-17.7-1-windows-x64-binaries.zip
Expand-Archive pg17.zip C:\Users\thede\pg17-portable

# 2. Create a data directory and start on port 5433
$bin = "C:\Users\thede\pg17-portable\pgsql\bin"
& "$bin\initdb.exe" -D C:\Users\thede\pg17-portable\data -U postgres -A trust -E UTF8 --no-locale
& "$bin\pg_ctl.exe" -D C:\Users\thede\pg17-portable\data -l C:\Users\thede\pg17-portable\pg.log -o "-p 5433" start
```

## Run the verification

```powershell
powershell -File scripts\verify-rls.ps1
```

Recreates the `mash_rls_check` database, applies stubs → all migrations →
grants → `30-blind-rule-test.sql`, and prints PASS/FAIL per assertion.

## Stopping / restarting the server

```powershell
& "$bin\pg_ctl.exe" -D C:\Users\thede\pg17-portable\data stop
& "$bin\pg_ctl.exe" -D C:\Users\thede\pg17-portable\data -l C:\Users\thede\pg17-portable\pg.log -o "-p 5433" start
```

## What this does NOT cover

Supabase-platform glue: PostgREST behaviour, Realtime, Auth token issuing,
and `supabase test db` (the pgTAP twin of this suite,
`supabase/tests/blind_read_test.sql`). Once Docker is available, run those
with `npx supabase start && npx supabase test db`.

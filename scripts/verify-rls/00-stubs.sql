-- Minimal stand-ins for the Supabase-managed pieces, so the real migration
-- can run on a vanilla PostgreSQL. Everything here mimics what the Supabase
-- platform provides before any migration runs:
--   * the `anon` / `authenticated` roles PostgREST switches into
--   * the `auth.users` table (only the columns our trigger/tests touch)
--   * auth.uid() — reads the `sub` claim from request.jwt.claims, exactly
--     like Supabase's implementation
-- NOTE: verification harness only. Never applied to a real Supabase project.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

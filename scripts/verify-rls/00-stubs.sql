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

-- Supabase ships an (initially empty) publication named supabase_realtime; the
-- sessions_live migration adds a table to it. Provide an empty one so that
-- migration's `alter publication ... add table` replays on vanilla Postgres.
do $$
begin
  if not exists (select from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- pg_net stand-in: Supabase provides net.http_post (async HTTP queue). The
-- stub RECORDS calls into net._requests instead, so the push-trigger test can
-- assert exactly what would have left the database.
create schema if not exists net;
create table if not exists net._requests (
  id bigserial primary key,
  url text,
  headers jsonb,
  body jsonb
);
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
declare
  v_id bigint;
begin
  insert into net._requests (url, headers, body)
  values (http_post.url, http_post.headers, http_post.body)
  returning id into v_id;
  return v_id;
end $$;

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

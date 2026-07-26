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

-- Realtime Authorization stand-in. Supabase's Realtime server authorizes a
-- PRIVATE channel by running RLS on realtime.messages with the channel name
-- bound to the `realtime.topic` GUC; realtime.topic() reads it back. Stubbing
-- both lets the typing-channel migration replay VERBATIM and — more to the
-- point — lets the twin execute the policy predicate itself, which is the
-- only thing standing between a stranger and someone's DM keystrokes.
create schema if not exists realtime;

create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;

create table if not exists realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null default 'broadcast',
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;

grant usage on schema realtime to anon, authenticated;
grant execute on function realtime.topic() to anon, authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;

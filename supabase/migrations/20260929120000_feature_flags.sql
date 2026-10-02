-- Feature flags: server-controlled switches the app reads once at launch.
--
-- First use: `livestreaming`, which hides Mash Potato Live. The client FAILS
-- CLOSED (lib/featureFlags.ts): an error, a timeout, or a missing row all mean
-- off. A flag can never turn a feature on by accident — only a row that says
-- `enabled = true` does.
--
-- App Store guideline 2.3.1 forbids "hidden, dormant, or undocumented
-- features", so a flag is a KILL SWITCH and a launch lever, never a way around
-- review: Live is also compiled out of the App Store build (VITE_LIVE_BUILD,
-- vite.config.ts), and turning it on for users means a reviewed update that
-- describes it. docs/LIVE.md has the exact sequence.
--
-- Public read, on purpose: flags gate UI for signed-out visitors too
-- (browsing is not behind an account, 5.1.1(v)). Nothing here is secret or
-- per-user. No client can write; flags change in the SQL Editor only.

create table public.feature_flags (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Grants explicitly, never the platform's defaults (the GRANTS LAW lesson):
-- read for everyone, write for no API role at all. That includes the service
-- role: the `live` Edge Function only reads, and a leaked service key should
-- not be able to switch a feature on. Flags change as `postgres` (SQL Editor).
revoke all on public.feature_flags from public, anon, authenticated, service_role;
grant select on public.feature_flags to anon, authenticated, service_role;

create policy feature_flags_read_all
  on public.feature_flags
  for select
  to anon, authenticated
  using (true);

create trigger feature_flags_touch_updated_at
  before update on public.feature_flags
  for each row execute function public.touch_updated_at();

insert into public.feature_flags (key, enabled)
values ('livestreaming', false)
on conflict (key) do nothing;

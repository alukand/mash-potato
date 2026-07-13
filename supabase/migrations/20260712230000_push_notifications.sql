-- Push notifications: device tokens + event triggers.
--
-- Three events leave the database (via pg_net -> the send-push Edge Function
-- -> APNs): you were added to a group, a round started in your group, and a
-- groupmate locked in scores. Payloads carry IDS ONLY — never score values,
-- so the blind rule cannot leak through the notification channel.
--
-- Delivery is best-effort by design: push_notify swallows every error, and
-- with no notification_config row it is a no-op (local dev, the test twins).

-- ============================== 0. pg_net ====================================
-- Available on Supabase (hosted + local stack). The verify-rls twin runs on
-- vanilla PostgreSQL where the extension doesn't exist; its 00-stubs.sql
-- provides a recording stand-in for net.http_post instead.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable; using the stubbed net schema (test twin)';
end $$;

-- ============================ 1. device tokens ===============================
create table public.device_tokens (
  token      text primary key check (char_length(token) between 8 and 4096),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index device_tokens_user_id_idx on public.device_tokens (user_id);

create trigger device_tokens_touch_updated_at
  before update on public.device_tokens
  for each row execute function public.touch_updated_at();

alter table public.device_tokens enable row level security;

-- Tokens are self-only in every direction.
create policy device_tokens_select_self on public.device_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy device_tokens_delete_self on public.device_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.device_tokens to authenticated;
revoke insert, update on public.device_tokens from authenticated;

-- Registration handles device hand-me-downs: possessing the token string IS
-- the proof of ownership (APNs handed it to this device), so a re-register
-- by a different account takes the row over.
create or replace function public.register_device_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid platform';
  end if;
  if p_token is null or char_length(p_token) not between 8 and 4096 then
    raise exception 'invalid token';
  end if;
  insert into public.device_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_device_token(text, text) from public;
grant execute on function public.register_device_token(text, text) to authenticated;

-- ======================= 2. delivery configuration ==========================
-- Singleton row seeded per environment (hosted only; empty = notifications
-- off). Holds the Edge Function endpoint, a shared secret it checks, and the
-- anon key as the Bearer so the platform's JWT gate passes. Service-only:
-- RLS on with no policies, plus explicit revokes.
create table public.notification_config (
  singleton boolean primary key default true check (singleton),
  endpoint  text not null,
  secret    text not null,
  bearer    text not null
);

alter table public.notification_config enable row level security;
revoke all on public.notification_config from authenticated, anon;

-- ============================ 3. the notifier ================================
create or replace function public.push_notify(p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cfg record;
begin
  select endpoint, secret, bearer into v_cfg from public.notification_config;
  if v_cfg.endpoint is null then
    return; -- notifications not configured (local dev, tests)
  end if;
  perform net.http_post(
    url := v_cfg.endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cfg.bearer,
      'x-push-secret', v_cfg.secret),
    body := p_payload);
exception when others then
  -- A notification must never break the write that caused it.
  raise warning 'push_notify failed: %', sqlerrm;
end;
$$;

-- ============================== 4. triggers ==================================

-- You were added to a group (self-inserts — creating your own group — skip).
create or replace function public.notify_group_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    perform public.push_notify(jsonb_build_object(
      'event', 'group_added',
      'group_id', new.group_id,
      'recipient_id', new.user_id,
      'actor_id', (select auth.uid())));
  end if;
  return new;
end;
$$;

create trigger on_group_member_added_notify
  after insert on public.group_members
  for each row execute function public.notify_group_member_added();

-- A round started: every member (minus the starter) gets the invite.
create or replace function public.notify_session_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_notify(jsonb_build_object(
    'event', 'round_started',
    'session_id', new.id,
    'group_id', new.group_id,
    'actor_id', new.created_by));
  return new;
end;
$$;

create trigger on_session_created_notify
  after insert on public.reveal_sessions
  for each row execute function public.notify_session_created();

-- A groupmate locked in scores (fresh lock or late score; unlocked edits and
-- category backfills stay quiet). IDS ONLY — the payload never sees scores.
create or replace function public.notify_scores_locked()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.locked)
     or (tg_op = 'UPDATE' and new.locked and not old.locked) then
    perform public.push_notify(jsonb_build_object(
      'event', 'member_locked',
      'session_id', new.session_id,
      'group_id', public.session_group_id(new.session_id),
      'actor_id', new.member_id));
  end if;
  return new;
end;
$$;

create trigger on_member_scores_locked_notify
  after insert or update on public.member_scores
  for each row execute function public.notify_scores_locked();

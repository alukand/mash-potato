-- Push notifications on vanilla PostgreSQL: device-token RLS + event triggers
-- against the recording net.http_post stub (00-stubs.sql). Same shape as the
-- pgTAP file: no-config silence, correct events, and ID-ONLY payloads.
--
-- Cast: Ana (owner), Ben (member).

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- PASS 1: token registration works and is self-visible
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
declare c int;
begin
  perform public.register_device_token('apns-token-ana-1234567890', 'ios');
  select count(*) into c from public.device_tokens;
  if c <> 1 then raise exception 'FAIL 1: owner should see their token (rows=%)', c; end if;
  raise notice 'PASS 1: token registered and self-visible';
end $$;

-- PASS 2: tokens are invisible to other users
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.device_tokens;
  if c <> 0 then raise exception 'FAIL 2: Ben sees % foreign tokens', c; end if;
  raise notice 'PASS 2: tokens are invisible to other users';
end $$;

-- PASS 3: a re-register by another account takes the token over
do $$
declare c int;
begin
  perform public.register_device_token('apns-token-ana-1234567890', 'ios');
  select count(*) into c from public.device_tokens
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if c <> 1 then raise exception 'FAIL 3: token takeover failed (rows=%)', c; end if;
  raise notice 'PASS 3: a device hand-me-down re-registers cleanly';
end $$;

-- PASS 4: notification_config is invisible to app users
do $$
declare c int;
begin
  begin
    select count(*) into c from public.notification_config;
    raise exception 'FAIL 4: notification_config readable by app users';
  exception when insufficient_privilege then
    raise notice 'PASS 4: notification_config is service-only';
  end;
end $$;

-- PASS 5: without config, writes succeed and nothing leaves the database
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
reset role;
do $$
declare c int;
begin
  select count(*) into c from net._requests;
  if c <> 0 then raise exception 'FAIL 5: % requests fired without config', c; end if;
  raise notice 'PASS 5: no config, no outbound requests';
end $$;

-- Seed the config; from here on, triggers should enqueue.
insert into public.notification_config (endpoint, secret, bearer)
values ('http://push.test/send-push', 'test-secret', 'test-bearer');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]');

insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true);

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story":9}', false);

-- PASS 6: the right three events queued; the unlocked save stayed silent
reset role;
do $$
declare c int;
begin
  select count(*) into c from net._requests;
  if c <> 3 then raise exception 'FAIL 6: expected 3 requests, saw %', c; end if;
  raise notice 'PASS 6: group_added + round_started + member_locked queued; unlocked saves silent';
end $$;

-- PASS 7: locking later fires member_locked
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
update public.member_scores set locked = true
  where session_id = '66666666-6666-6666-6666-666666666666'
    and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;
do $$
declare c int;
begin
  select count(*) into c from net._requests where body ->> 'event' = 'member_locked';
  if c <> 2 then raise exception 'FAIL 7: expected 2 member_locked events, saw %', c; end if;
  raise notice 'PASS 7: locking an unlocked card fires member_locked';
end $$;

-- PASS 8: THE HYGIENE RULE — payloads carry ids only, never score values
do $$
declare c int;
begin
  select count(*) into c from net._requests where body::text like '%scores%';
  if c <> 0 then raise exception 'FAIL 8: % payloads contained score data', c; end if;
  select count(*) into c from net._requests
    where url <> 'http://push.test/send-push'
       or (headers ->> 'x-push-secret') is distinct from 'test-secret';
  if c <> 0 then raise exception 'FAIL 8: % requests missed endpoint or secret', c; end if;
  raise notice 'PASS 8: payloads are id-only and carry the shared secret';
end $$;

do $$ begin raise notice '=== ALL 8 PUSH ASSERTIONS PASSED ==='; end $$;

rollback;

-- Push notifications: device-token RLS + event triggers.
-- Proves the pipeline enqueues the right events with ID-ONLY payloads (score
-- values must never ride a notification), and that everything is a no-op when
-- notification_config is empty. Run with: npx supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ================= device tokens: self-only in every direction ==============
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$select public.register_device_token('apns-token-ana-1234567890', 'ios')$$,
  'a signed-in user registers a device token');

select is(
  (select count(*)::int from public.device_tokens),
  1, 'the owner sees their token');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.device_tokens),
  0, 'tokens are invisible to other users');

-- Device changed hands: re-registering the same token takes the row over.
select lives_ok(
  $$select public.register_device_token('apns-token-ana-1234567890', 'ios')$$,
  'a re-register by another account takes the token over');
select is(
  (select count(*)::int from public.device_tokens
     where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1, 'the token now belongs to the new account');

select throws_ok(
  $$select public.register_device_token('short', 'ios')$$,
  'P0001', 'invalid token',
  'garbage tokens are rejected');

-- The delivery config is service-only.
select throws_ok(
  $$select count(*) from public.notification_config$$,
  '42501', null,
  'notification_config is invisible to app users');

-- ================= triggers: quiet without config ============================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

reset role;
select is(
  (select count(*)::int from net.http_request_queue),
  0, 'no config, no outbound requests (and group creation still works)');

-- ================= triggers: enqueue with config =============================
insert into public.notification_config (endpoint, secret, bearer)
values ('http://push.test/send-push', 'test-secret', 'test-bearer');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- Ana adds Ben -> group_added for Ben.
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- Ana starts a round -> round_started.
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]');

-- Ana locks scores -> member_locked. Ben saves UNLOCKED -> silence.
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true);

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story":9}', false);

reset role;
select is(
  (select count(*)::int from net.http_request_queue),
  3, 'group_added + round_started + member_locked queued; unlocked saves are silent');

-- Ben locks -> one more.
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
update public.member_scores set locked = true
  where session_id = '66666666-6666-6666-6666-666666666666'
    and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

reset role;
select is(
  (select count(*)::int from net.http_request_queue),
  4, 'locking an unlocked card fires member_locked');

select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%member_locked%'),
  2, 'both locks carried the member_locked event');

-- THE HYGIENE RULE: notification payloads carry ids only, never score values.
select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%scores%'),
  0, 'no payload ever contains score data');

select is(
  (select count(*)::int from net.http_request_queue
     where url <> 'http://push.test/send-push'),
  0, 'every request targets the configured endpoint');

select is(
  (select count(*)::int from net.http_request_queue
     where (headers ->> 'x-push-secret') is distinct from 'test-secret'),
  0, 'every request carries the shared secret');

-- ===================== messaging: new_message ==============================
-- Ana and Ben share a group, so their DM opens accepted.
set local role authenticated;
reset role;
update public.profiles set accepted_terms_at = now();
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as push_dm \gset
select public.send_message(:'push_dm', 'the sandworm bit is unreal') as _pm \gset

reset role;
-- 15
select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%new_message%'),
  1, 'sending a message queues exactly one new_message event');

-- 16: THE HYGIENE RULE again, for words this time. The Edge Function resolves
-- the text with the service key; it must never ride the pg_net payload.
select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%sandworm%'),
  0, 'no payload ever contains message text');

-- 17: and no field that could carry it
select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%"body"%'
        or convert_from(body, 'utf8') like '%preview%'),
  0, 'no payload carries a body or preview field');

-- 18: a roster 'system' message is not an alert
set local role authenticated;
select public.create_group_chat('Push Chat',
  array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[]) as push_chat \gset
select public.add_chat_participants(:'push_chat', array[]::uuid[]) as _noop \gset
reset role;
select is(
  (select count(*)::int from net.http_request_queue
     where convert_from(body, 'utf8') like '%new_message%'),
  1, 'a system message (roster change) queues nothing');

select * from finish();
rollback;

-- Account management: self-serve deletion (with group handoff) and the
-- security-hardening grant posture. Run with: npx supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

-- ---- helpers -------------------------------------------------------------
-- Name-based privilege probe: true iff the role can execute ANY function
-- with this name in public (signature-free, overload-proof).
create function pg_temp.can_exec(p_role text, p_fn text) returns boolean
language sql as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_fn
      and has_function_privilege(p_role, p.oid, 'EXECUTE'))
$$;

-- ================= the hardened grant posture =================
select ok(not pg_temp.can_exec('anon', 'late_score_session'),
  'hardening: anon cannot execute late_score_session');
select ok(not pg_temp.can_exec('anon', 'public_profile'),
  'hardening: anon cannot execute public_profile');
select ok(pg_temp.can_exec('authenticated', 'late_score_session'),
  'hardening: authenticated keeps late_score_session (RPC)');
select ok(pg_temp.can_exec('authenticated', 'is_group_member'),
  'hardening: authenticated keeps is_group_member (RLS helper)');
select ok(not pg_temp.can_exec('authenticated', 'push_notify'),
  'hardening: authenticated cannot forge push_notify');
select ok(not pg_temp.can_exec('authenticated', 'handle_new_user'),
  'hardening: authenticated cannot call trigger internals');

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 508442, 'movie', 'Soul', 2020);

-- ---- Ana owns two groups: one with heirs, one solo ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Handoff Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
       ('88888888-8888-8888-8888-888888888888', 'Solo Den',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Ben joined before Cara: he is the longest-standing heir.
insert into public.group_members (group_id, user_id, role, joined_at)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', now() - interval '2 days'),
       ('99999999-9999-9999-9999-999999999999',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', now() - interval '1 day');

-- A revealed round so history has something to survive.
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]');
insert into public.member_scores (session_id, member_id, scores, locked, one_liner)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true, 'Leaving soon.');

-- Ben locks his own card (writes are self-only).
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked, one_liner)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story":7}', true, 'Staying put.');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.reveal_session('66666666-6666-6666-6666-666666666666');

-- ================= Ana deletes her account =================
select lives_ok(
  $$select public.delete_my_account()$$,
  'deletion: the owner of groups can delete their account');

reset role;

select is(
  (select owner_id from public.groups where id = '99999999-9999-9999-9999-999999999999'),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'handoff: the longest-standing member inherits the group');

select is(
  (select role::text from public.group_members
     where group_id = '99999999-9999-9999-9999-999999999999'
       and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'owner', 'handoff: the heir is promoted to owner');

select is(
  (select count(*)::int from public.groups where id = '88888888-8888-8888-8888-888888888888'),
  0, 'handoff: a group with no other members is deleted');

select is(
  (select count(*)::int from public.member_scores
     where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'deletion: the deleter''s scorecards are gone');

select is(
  (select count(*)::int from public.member_scores
     where member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1, 'deletion: other members'' scorecards survive');

select results_eq(
  $$select state::text, created_by from public.reveal_sessions
      where id = '66666666-6666-6666-6666-666666666666'$$,
  $$values ('revealed', null::uuid)$$,
  'deletion: the reveal survives with created_by cleared');

select is(
  (select count(*)::int from auth.users
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'deletion: the auth user row is gone');

select is(
  (select count(*)::int from public.profiles
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'deletion: the profile is gone');

select * from finish();
rollback;

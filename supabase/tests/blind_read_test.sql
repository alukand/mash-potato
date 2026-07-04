-- Proves THE ONE RULE: a member can read others' scores only once the session
-- is 'revealed'. Run with: npx supabase test db   (needs the local stack up).

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());
-- (the on_auth_user_created trigger created their profiles)

-- A shared title (titles are a global cache).
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ---- act as Ana (owner) ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- (trigger added Ana as owner-member and seeded the rubric)

insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.member_scores
  (session_id, member_id, story, acting, cinematography, pacing, score_sound, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 8, 8, 9, 6, 9, true);

-- ---- act as Ben (member) ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.member_scores
  (session_id, member_id, story, acting, cinematography, pacing, score_sound, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 9, 8, 10, 9, 8, true);

-- ================= assertions: BLIND =================
select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'
       and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1, 'blind: Ben can read his OWN scorecard');

select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'
       and member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'blind: Ben CANNOT read Ana''s scorecard');

select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'),
  1, 'blind: Ben sees only his own row');

-- ================= reveal (as Ana) =================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.reveal_session('66666666-6666-6666-6666-666666666666')$$,
  'the owner can reveal the session'
);

-- ================= assertions: REVEALED =================
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'
       and member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'revealed: Ben CAN now read Ana''s scorecard');

select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'),
  2, 'revealed: Ben sees the whole group');

-- Even after reveal, Ben cannot modify Ana's row (write stays self-only).
-- (results_eq so the data-modifying CTE executes at top level.)
select results_eq(
  $$
  with up as (
    update public.member_scores set story = 1
      where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        and session_id = '66666666-6666-6666-6666-666666666666'
      returning 1)
  select count(*)::int from up
  $$,
  $$values (0)$$,
  'revealed: Ben still cannot modify Ana''s row');

select * from finish();
rollback;

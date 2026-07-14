-- Proves THE ONE RULE: a member can read others' scores only once the session
-- is 'revealed'. Run with: npx supabase test db   (needs the local stack up).

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());
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

insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20},
          {"key":"acting","label":"Acting","weight":20},
          {"key":"cinematography","label":"Cinematography","weight":20},
          {"key":"pacing","label":"Editing & Pacing","weight":20},
          {"key":"scoreSound","label":"Sound & Music","weight":20}]');

insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '{"story":8,"acting":8,"cinematography":9,"pacing":6,"scoreSound":9}', true);

-- Quorum: one lock in a two-member group cannot drop the reveal on everyone.
select throws_ok(
  $$select public.reveal_session('66666666-6666-6666-6666-666666666666')$$,
  'P0001', 'the reveal needs a second locked scorecard',
  'reveal: blocked until a second member locks in');

-- ---- act as Ben (member) ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '{"story":9,"acting":8,"cinematography":10,"pacing":9,"scoreSound":8}', true);

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

-- Lock flags (and ONLY lock flags) are visible to members while blind.
select results_eq(
  $$select member_id, locked
      from public.session_lock_status('66666666-6666-6666-6666-666666666666')
      order by member_id$$,
  $$values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, true),
           ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, true)$$,
  'blind: members can see who has locked (flags only, no scores)');

-- An authenticated outsider gets nothing from the lock-status helper.
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is_empty(
  $$select * from public.session_lock_status('66666666-6666-6666-6666-666666666666')$$,
  'blind: a non-member gets no lock status');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

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
    update public.member_scores set scores = scores || '{"story":1}'::jsonb
      where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        and session_id = '66666666-6666-6666-6666-666666666666'
      returning 1)
  select count(*)::int from up
  $$,
  $$values (0)$$,
  'revealed: Ben still cannot modify Ana''s row');

-- ============== LIVING REVEALS: late scoring + category backfill ==============

-- Cara is authenticated but not (yet) in the group.
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"story":7}'::jsonb)$$,
  'P0001', 'not a member of this group',
  'late scoring: an outsider is rejected');

-- Ana adds Cara: a member who joined AFTER the reveal.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

-- SEALED: a member who hasn't locked their own card sees NOTHING, even
-- though the session is revealed. The reveal opens per member.
select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'),
  0, 'sealed: revealed scores stay hidden until your own card is locked');

-- Direct inserts are blind-only now; revealed writes exist only via the RPCs.
select throws_ok(
  $$insert into public.member_scores (session_id, member_id, scores, locked)
    values ('66666666-6666-6666-6666-666666666666',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"story":7}'::jsonb, true)$$,
  '42501', null,
  'revealed: direct inserts are blocked once a session is revealed');

select throws_ok(
  $$select public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"nonsense":7}'::jsonb)$$,
  'P0001', 'scores must map this session''s categories to whole numbers 1-10',
  'late scoring: keys outside the session rubric are rejected');

select lives_ok(
  $$select public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"story":7,"acting":6,"cinematography":8,"pacing":7,"scoreSound":5}'::jsonb)$$,
  'late scoring: a new member scores a revealed session');

select is(
  (select count(*)::int from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'),
  3, 'late scoring: Cara''s card joins the reveal (she sees all three)');

select throws_ok(
  $$select public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"story":9}'::jsonb)$$,
  'P0001', 'already locked in for this session',
  'late scoring: a locked card cannot be re-scored');

-- A second, still-blind session: late scoring keeps its hands off.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('55555555-5555-5555-5555-555555555555',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select public.late_score_session('55555555-5555-5555-5555-555555555555',
      '{"story":5}'::jsonb)$$,
  'P0001', 'late scoring is only for revealed sessions',
  'late scoring: blind sessions are untouched');

-- Backfill: Ben starts carrying Rewatchability (rubric growth after the fact).
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rewatchability', 'Rewatchability', 30, true, 9);

select throws_ok(
  $$select public.backfill_category_score('66666666-6666-6666-6666-666666666666',
      'nonsense', 8)$$,
  'P0001', 'category is not part of this group''s rubric',
  'backfill: a category nobody carries is rejected');

select throws_ok(
  $$select public.backfill_category_score('66666666-6666-6666-6666-666666666666',
      'story', 10)$$,
  'P0001', 'category already scored',
  'backfill: an already-scored category can never be overwritten');

select lives_ok(
  $$select public.backfill_category_score('66666666-6666-6666-6666-666666666666',
      'rewatchability', 9)$$,
  'backfill: a member fills in the new category');

select is(
  (select scores->>'rewatchability' from public.member_scores
     where session_id = '66666666-6666-6666-6666-666666666666'
       and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '9', 'backfill: the score landed on Ben''s card');

-- Appended at the group's effective weight: 30 carried by 1 of 3 members = 10.
select is(
  (select (e->>'weight')::numeric
     from public.reveal_sessions rs,
          jsonb_array_elements(rs.rubric) e
     where rs.id = '66666666-6666-6666-6666-666666666666'
       and e->>'key' = 'rewatchability'),
  10::numeric,
  'backfill: the category joined the snapshot at the effective weight');

-- ============== QUORUM vs RSVP: passes must not deadlock the reveal ==============
-- Group is now Ana + Ben + Cara. Two fresh blind sessions.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('44444444-4444-4444-4444-444444444444',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]'),
       ('33333333-3333-3333-3333-333333333333',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]');
insert into public.member_scores (session_id, member_id, scores, locked)
values ('44444444-4444-4444-4444-444444444444',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true),
       ('33333333-3333-3333-3333-333333333333',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true);

-- Session 4444: Ben AND Cara pass. Ana is the only participant left.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.session_rsvps (session_id, member_id, status)
values ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pass'),
       ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pass');
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
insert into public.session_rsvps (session_id, member_id, status)
values ('44444444-4444-4444-4444-444444444444', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pass');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.reveal_session('44444444-4444-4444-4444-444444444444')$$,
  'quorum: a round everyone else passed on reveals with one locked card');

-- Session 3333: Cara never answered and the 24h window is still open, so she
-- still counts as eligible and one lock is not enough.
select throws_ok(
  $$select public.reveal_session('33333333-3333-3333-3333-333333333333')$$,
  'P0001', 'the reveal needs a second locked scorecard',
  'quorum: an unanswered invite inside the window still holds the reveal');

-- Once the window lapses, the unanswered invite counts as a pass.
reset role;
update public.reveal_sessions set created_at = now() - interval '25 hours'
  where id = '33333333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.reveal_session('33333333-3333-3333-3333-333333333333')$$,
  'quorum: after the invite window an unanswered member no longer holds it');

select * from finish();
rollback;

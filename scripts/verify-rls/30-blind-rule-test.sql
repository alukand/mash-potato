-- THE ONE RULE THAT MUST NOT BE WRONG, proven against live RLS:
-- a member reads OTHERS' scores only once the session is 'revealed'.
--
-- Plain-SQL port of supabase/tests/blind_read_test.sql (pgTAP) so it runs on
-- vanilla PostgreSQL — same seed, same six assertions, plus four hardening
-- checks. Each assertion raises an exception on failure (psql exits non-zero
-- via ON_ERROR_STOP); on success it prints a PASS notice.
--
-- Cast: Ana (owner), Ben (member), Cara (authenticated but NOT in the group).

\set ON_ERROR_STOP on

begin;

-- ---- seed as superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());
-- (the on_auth_user_created trigger created their profiles)

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

-- PASS 4c: quorum — one lock in a two-member group cannot drop the reveal
do $$
begin
  begin
    perform public.reveal_session('66666666-6666-6666-6666-666666666666');
    raise exception 'FAIL 4c: a single lock revealed the session for everyone';
  exception when raise_exception then
    if sqlerrm = 'the reveal needs a second locked scorecard' then
      raise notice 'PASS 4c: the reveal is blocked until a second member locks in';
    else raise; end if;
  end;
end $$;

-- ---- act as Ben (member) ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '{"story":9,"acting":8,"cinematography":10,"pacing":9,"scoreSound":8}', true);

-- ================= assertions: BLIND =================

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666'
      and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if c <> 1 then raise exception 'FAIL 1 (blind): Ben cannot read his OWN scorecard (rows=%)', c; end if;
  raise notice 'PASS 1 (blind): Ben can read his own scorecard';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666'
      and member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 0 then raise exception 'FAIL 2 (blind): Ben CAN read Ana''s scorecard — THE BLIND RULE IS BROKEN (rows=%)', c; end if;
  raise notice 'PASS 2 (blind): Ben cannot read Ana''s scorecard';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666';
  if c <> 1 then raise exception 'FAIL 3 (blind): Ben should see exactly his own row (rows=%)', c; end if;
  raise notice 'PASS 3 (blind): Ben sees only his own row';
end $$;

-- hardening: Ben must not be able to write a scorecard for Ana
do $$
begin
  begin
    insert into public.member_scores (session_id, member_id, scores)
    values ('66666666-6666-6666-6666-666666666666',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '{"story":1,"acting":1,"cinematography":1,"pacing":1,"scoreSound":1}');
    raise exception 'FAIL 4: Ben inserted a scorecard for Ana — insert policy is broken';
  exception
    when insufficient_privilege then
      raise notice 'PASS 4 (blind): Ben cannot insert a scorecard for Ana';
  end;
end $$;

-- lock flags (and only lock flags) are visible to members while blind
do $$
declare c int;
begin
  select count(*) into c
    from public.session_lock_status('66666666-6666-6666-6666-666666666666');
  if c <> 2 then raise exception 'FAIL 4b (blind): members should see both lock flags (rows=%)', c; end if;
  raise notice 'PASS 4b (blind): members see who has locked — flags only';
end $$;

-- ================= reveal (as Ana) =================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.reveal_session('66666666-6666-6666-6666-666666666666');

-- ================= assertions: REVEALED =================
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666'
      and member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 1 then raise exception 'FAIL 5 (revealed): Ben still cannot read Ana''s scorecard (rows=%)', c; end if;
  raise notice 'PASS 5 (revealed): Ben can now read Ana''s scorecard';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666';
  if c <> 2 then raise exception 'FAIL 6 (revealed): Ben should see the whole group (rows=%)', c; end if;
  raise notice 'PASS 6 (revealed): Ben sees the whole group';
end $$;

do $$
declare c int;
begin
  with up as (
    update public.member_scores set scores = scores || '{"story":1}'::jsonb
      where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        and session_id = '66666666-6666-6666-6666-666666666666'
      returning 1
  )
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 7 (revealed): Ben modified Ana''s row (rows=%)', c; end if;
  raise notice 'PASS 7 (revealed): Ben still cannot modify Ana''s row';
end $$;

-- hardening: scores freeze after the reveal, even your own
do $$
declare c int;
begin
  with up as (
    update public.member_scores set scores = scores || '{"story":10}'::jsonb
      where member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        and session_id = '66666666-6666-6666-6666-666666666666'
      returning 1
  )
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 8 (revealed): Ben edited his own score after the reveal (rows=%)', c; end if;
  raise notice 'PASS 8 (revealed): scores are frozen after the reveal, even your own';
end $$;

-- hardening: an authenticated outsider sees nothing, even after the reveal
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
declare sc int; se int;
begin
  select count(*) into sc from public.member_scores;
  select count(*) into se from public.reveal_sessions;
  if sc <> 0 or se <> 0 then
    raise exception 'FAIL 9 (outsider): Cara sees % score rows and % sessions — group isolation is broken', sc, se;
  end if;
  raise notice 'PASS 9 (outsider): a non-member sees no scores and no sessions, even revealed';
end $$;

do $$
declare c int;
begin
  select count(*) into c
    from public.session_lock_status('66666666-6666-6666-6666-666666666666');
  if c <> 0 then raise exception 'FAIL 9b (outsider): Cara got % lock-status rows', c; end if;
  raise notice 'PASS 9b (outsider): a non-member gets no lock status';
end $$;

-- hardening: a revealed session can never go back to blind
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
begin
  begin
    update public.reveal_sessions set state = 'blind'
      where id = '66666666-6666-6666-6666-666666666666';
    raise exception 'FAIL 10: a revealed session was flipped back to blind';
  exception
    when raise_exception then
      if sqlerrm like '%un-revealed%' then
        raise notice 'PASS 10: a revealed session cannot be un-revealed';
      else
        raise;
      end if;
  end;
end $$;

-- ============== LIVING REVEALS: late scoring + category backfill ==============

-- PASS 11: an outsider cannot late-score a revealed session
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
begin
  begin
    perform public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"story":7}'::jsonb);
    raise exception 'FAIL 11: an outsider late-scored a revealed session';
  exception when raise_exception then
    if sqlerrm = 'not a member of this group' then
      raise notice 'PASS 11: late scoring rejects an outsider';
    else raise; end if;
  end;
end $$;

-- Ana adds Cara: a member who joined AFTER the reveal.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

-- PASS 11b: SEALED — no locked card of your own, no reveal for you
do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666';
  if c <> 0 then
    raise exception 'FAIL 11b: an unvoted member sees % revealed scorecards', c;
  end if;
  raise notice 'PASS 11b: revealed scores stay sealed until your own card is locked';
end $$;

-- PASS 12: direct inserts are blind-only once a session is revealed
do $$
begin
  begin
    insert into public.member_scores (session_id, member_id, scores, locked)
    values ('66666666-6666-6666-6666-666666666666',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"story":7}'::jsonb, true);
    raise exception 'FAIL 12: a direct insert landed on a revealed session';
  exception when insufficient_privilege then
    raise notice 'PASS 12: direct inserts are blocked once revealed (RPC only)';
  end;
end $$;

-- PASS 13: keys outside the session rubric are rejected
do $$
begin
  begin
    perform public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"nonsense":7}'::jsonb);
    raise exception 'FAIL 13: a key outside the session rubric was accepted';
  exception when raise_exception then
    if sqlerrm = 'scores must map this session''s categories to whole numbers 1-10' then
      raise notice 'PASS 13: late scoring validates keys against the snapshot';
    else raise; end if;
  end;
end $$;

-- PASS 14: a new member scores the revealed session
do $$
begin
  perform public.late_score_session('66666666-6666-6666-6666-666666666666',
    '{"story":7,"acting":6,"cinematography":8,"pacing":7,"scoreSound":5}'::jsonb);
  raise notice 'PASS 14: a new member late-scored the revealed session';
end $$;

-- PASS 15: Cara's card joined the reveal (she sees all three)
do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666';
  if c <> 3 then raise exception 'FAIL 15: expected 3 scorecards, saw %', c; end if;
  raise notice 'PASS 15: the late card joined the reveal';
end $$;

-- PASS 16: a locked card cannot be re-scored
do $$
begin
  begin
    perform public.late_score_session('66666666-6666-6666-6666-666666666666',
      '{"story":9}'::jsonb);
    raise exception 'FAIL 16: a locked card was re-scored';
  exception when raise_exception then
    if sqlerrm = 'already locked in for this session' then
      raise notice 'PASS 16: locked cards cannot be re-scored';
    else raise; end if;
  end;
end $$;

-- PASS 17: blind sessions are untouched by late scoring
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('55555555-5555-5555-5555-555555555555',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
begin
  begin
    perform public.late_score_session('55555555-5555-5555-5555-555555555555',
      '{"story":5}'::jsonb);
    raise exception 'FAIL 17: a blind session accepted a late score';
  exception when raise_exception then
    if sqlerrm = 'late scoring is only for revealed sessions' then
      raise notice 'PASS 17: blind sessions are untouched by late scoring';
    else raise; end if;
  end;
end $$;

-- Backfill setup: Ben starts carrying Rewatchability (rubric growth).
insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rewatchability', 'Rewatchability', 30, true, 9);

-- PASS 18: a category nobody carries is rejected
do $$
begin
  begin
    perform public.backfill_category_score('66666666-6666-6666-6666-666666666666',
      'nonsense', 8);
    raise exception 'FAIL 18: a category nobody carries was backfilled';
  exception when raise_exception then
    if sqlerrm = 'category is not part of this group''s rubric' then
      raise notice 'PASS 18: backfill rejects categories the group does not carry';
    else raise; end if;
  end;
end $$;

-- PASS 19: an already-scored category can never be overwritten
do $$
begin
  begin
    perform public.backfill_category_score('66666666-6666-6666-6666-666666666666',
      'story', 10);
    raise exception 'FAIL 19: an existing score was overwritten via backfill';
  exception when raise_exception then
    if sqlerrm = 'category already scored' then
      raise notice 'PASS 19: backfill can never overwrite an existing score';
    else raise; end if;
  end;
end $$;

-- PASS 20: the new category backfills onto Ben's locked card
do $$
declare v text;
begin
  perform public.backfill_category_score('66666666-6666-6666-6666-666666666666',
    'rewatchability', 9);
  select scores->>'rewatchability' into v from public.member_scores
    where session_id = '66666666-6666-6666-6666-666666666666'
      and member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v is distinct from '9' then
    raise exception 'FAIL 20: backfilled score not found (got %)', v;
  end if;
  raise notice 'PASS 20: the new category backfilled onto the locked card';
end $$;

-- PASS 21: the snapshot grew append-only at the effective weight (30/3 = 10)
do $$
declare w numeric;
begin
  select (e->>'weight')::numeric into w
    from public.reveal_sessions rs,
         jsonb_array_elements(rs.rubric) e
    where rs.id = '66666666-6666-6666-6666-666666666666'
      and e->>'key' = 'rewatchability';
  if w is distinct from 10::numeric then
    raise exception 'FAIL 21: snapshot weight wrong (got %)', w;
  end if;
  raise notice 'PASS 21: the snapshot grew append-only at the effective weight';
end $$;

-- ============== QUORUM vs RSVP: passes must not deadlock the reveal ==============
-- Group is Ana + Ben + Cara. Two fresh blind sessions.
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

-- Session 4444: Ben AND Cara pass; session 3333: only Ben passes.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.session_rsvps (session_id, member_id, status)
values ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pass'),
       ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pass');
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
insert into public.session_rsvps (session_id, member_id, status)
values ('44444444-4444-4444-4444-444444444444', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pass');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- PASS 22: a round everyone else passed on reveals with one locked card
do $$
begin
  perform public.reveal_session('44444444-4444-4444-4444-444444444444');
  raise notice 'PASS 22: a round everyone else passed on reveals with one locked card';
end $$;

-- PASS 23: an unanswered invite inside the 24h window still holds the reveal
do $$
begin
  begin
    perform public.reveal_session('33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL 23: one lock revealed while an invite was still open';
  exception when raise_exception then
    if sqlerrm = 'the reveal needs a second locked scorecard' then
      raise notice 'PASS 23: an unanswered invite inside the window still holds the reveal';
    else raise; end if;
  end;
end $$;

-- PASS 24: after the window an unanswered member counts as a pass
reset role;
update public.reveal_sessions set created_at = now() - interval '25 hours'
  where id = '33333333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  perform public.reveal_session('33333333-3333-3333-3333-333333333333');
  raise notice 'PASS 24: after the invite window an unanswered member no longer holds the reveal';
end $$;

do $$ begin raise notice '=== ALL 28 ASSERTIONS PASSED — the blind rule holds, reveals open per member, RSVP passes never deadlock ==='; end $$;

rollback;

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

insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '{"story":8,"acting":8,"cinematography":9,"pacing":6,"scoreSound":9}', true);

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

do $$ begin raise notice '=== ALL 12 ASSERTIONS PASSED — the blind rule holds ==='; end $$;

rollback;

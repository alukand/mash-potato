-- Account management, proven against live RLS + grants: self-serve deletion
-- (group handoff to the longest-standing member) and the hardened function
-- grant posture. Plain-SQL twin of supabase/tests/account_test.sql.
--
-- Cast: Ana (deleting owner), Ben (heir), Cara (later member).

\set ON_ERROR_STOP on

begin;

-- Name-based privilege probe (signature-free).
create function pg_temp.can_exec(p_role text, p_fn text) returns boolean
language sql as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_fn
      and has_function_privilege(p_role, p.oid, 'EXECUTE'))
$$;

-- ================= PASS 1-6: the hardened grant posture =================
do $$
begin
  if pg_temp.can_exec('anon', 'late_score_session') then
    raise exception 'FAIL 1: anon can execute late_score_session';
  end if;
  raise notice 'PASS 1: anon cannot execute late_score_session';

  if pg_temp.can_exec('anon', 'public_profile') then
    raise exception 'FAIL 2: anon can execute public_profile';
  end if;
  raise notice 'PASS 2: anon cannot execute public_profile';

  if not pg_temp.can_exec('authenticated', 'late_score_session') then
    raise exception 'FAIL 3: authenticated lost late_score_session';
  end if;
  raise notice 'PASS 3: authenticated keeps late_score_session (RPC)';

  if not pg_temp.can_exec('authenticated', 'is_group_member') then
    raise exception 'FAIL 4: authenticated lost is_group_member (RLS helpers would break)';
  end if;
  raise notice 'PASS 4: authenticated keeps is_group_member (RLS helper)';

  if pg_temp.can_exec('authenticated', 'push_notify') then
    raise exception 'FAIL 5: authenticated can forge push_notify';
  end if;
  raise notice 'PASS 5: authenticated cannot forge push_notify';

  if pg_temp.can_exec('authenticated', 'handle_new_user') then
    raise exception 'FAIL 6: authenticated can call trigger internals';
  end if;
  raise notice 'PASS 6: authenticated cannot call trigger internals';
end $$;

-- ---- seed as superuser (RLS bypassed) ----
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

-- ================= PASS 7-15: Ana deletes her account =================
do $$
begin
  perform public.delete_my_account();
  raise notice 'PASS 7: a group owner can delete their account';
end $$;

reset role;

do $$
declare v uuid;
begin
  select owner_id into v from public.groups
    where id = '99999999-9999-9999-9999-999999999999';
  if v is distinct from 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid then
    raise exception 'FAIL 8: heir is % (expected Ben)', v;
  end if;
  raise notice 'PASS 8: the longest-standing member inherits the group';
end $$;

do $$
declare v text;
begin
  select role::text into v from public.group_members
    where group_id = '99999999-9999-9999-9999-999999999999'
      and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v is distinct from 'owner' then
    raise exception 'FAIL 9: heir role is % (expected owner)', v;
  end if;
  raise notice 'PASS 9: the heir is promoted to owner';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.groups
    where id = '88888888-8888-8888-8888-888888888888';
  if c <> 0 then raise exception 'FAIL 10: the solo group survived'; end if;
  raise notice 'PASS 10: a group with no other members is deleted';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 0 then raise exception 'FAIL 11: the deleter''s scorecards remain (%)', c; end if;
  raise notice 'PASS 11: the deleter''s scorecards are gone';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.member_scores
    where member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if c <> 1 then raise exception 'FAIL 12: Ben''s scorecard count is %', c; end if;
  raise notice 'PASS 12: other members'' scorecards survive';
end $$;

do $$
declare v_state text; v_creator uuid;
begin
  select state::text, created_by into v_state, v_creator
    from public.reveal_sessions where id = '66666666-6666-6666-6666-666666666666';
  if v_state is distinct from 'revealed' or v_creator is not null then
    raise exception 'FAIL 13: session state=% creator=%', v_state, v_creator;
  end if;
  raise notice 'PASS 13: the reveal survives with created_by cleared';
end $$;

do $$
declare c int;
begin
  select count(*) into c from auth.users
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 0 then raise exception 'FAIL 14: the auth user row survived'; end if;
  raise notice 'PASS 14: the auth user row is gone';
end $$;

do $$
declare c int;
begin
  select count(*) into c from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 0 then raise exception 'FAIL 15: the profile survived'; end if;
  raise notice 'PASS 15: the profile is gone';
end $$;

do $$ begin raise notice '=== ALL 15 ACCOUNT ASSERTIONS PASSED — deletion hands off groups, cascades clean, internals stay sealed ==='; end $$;

rollback;

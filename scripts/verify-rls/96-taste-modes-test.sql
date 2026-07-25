-- Taste modes on vanilla Postgres: mode is self-editable only, the per-mode
-- aggregates bucket by CURRENT mode with per-mode weights, and rubric seeding
-- follows the mode. Mirrors supabase/tests/taste_modes_test.sql.

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

-- 1: fresh profiles default casual
do $$
declare v text;
begin
  select taste_mode into v from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v <> 'casual' then raise exception 'FAIL 1: fresh profile mode is % (want casual)', v; end if;
  raise notice 'PASS 1: a fresh profile defaults to casual';
end $$;

-- 2: you can switch your own mode
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare v text;
begin
  update public.profiles set taste_mode = 'buff'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select taste_mode into v from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v <> 'buff' then raise exception 'FAIL 2: own-mode switch did not stick (%)', v; end if;
  raise notice 'PASS 2: you can switch your own mode';
end $$;

-- 3: Ben cannot flip Ana (self-only update: zero rows)
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int;
begin
  with up as (
    update public.profiles set taste_mode = 'casual'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      returning 1)
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 3: Ben flipped Ana''s mode (rows=%)', c; end if;
  raise notice 'PASS 3: nobody can switch a mode for you';
end $$;

-- 4: unknown modes bounce off the check constraint
do $$
begin
  begin
    update public.profiles set taste_mode = 'critic'
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    raise exception 'FAIL 4: an unknown mode was accepted';
  exception
    when check_violation then
      raise notice 'PASS 4: unknown modes bounce off the check constraint';
  end;
end $$;

-- both crowds rate the same title
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
        '{"enjoyment":9,"acting":7,"writing":7}');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777',
        '{"story":6}');

-- 5: one row per crowd, each on its own rubric
do $$
declare buff_score numeric; casual_score numeric; n int;
begin
  select count(*) into n from public.title_mode_scores(
    '77777777-7777-7777-7777-777777777777',
    '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
    '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb);
  select round(mashed, 2) into buff_score from public.title_mode_scores(
    '77777777-7777-7777-7777-777777777777',
    '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
    '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb)
    where mode = 'buff';
  select round(mashed, 2) into casual_score from public.title_mode_scores(
    '77777777-7777-7777-7777-777777777777',
    '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
    '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb)
    where mode = 'casual';
  if n <> 2 or buff_score <> 6.00 or casual_score <> 8.00 then
    raise exception 'FAIL 5: mode buckets wrong (rows=%, buff=%, casual=%)', n, buff_score, casual_score;
  end if;
  raise notice 'PASS 5: the two crowds aggregate separately, each on its own rubric';
end $$;

-- 6 + 7: histogram spans both crowds, and the filter narrows to one
do $$
declare all_n int; casual_bucket int;
begin
  select count(*) into all_n from public.title_mode_histogram(
    '77777777-7777-7777-7777-777777777777',
    '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
    '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb);
  select bucket into casual_bucket from public.title_mode_histogram(
    '77777777-7777-7777-7777-777777777777',
    '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
    '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb,
    'casual');
  if all_n <> 2 then raise exception 'FAIL 6: everyone histogram has % buckets (want 2)', all_n; end if;
  raise notice 'PASS 6: the everyone histogram spans both crowds';
  if casual_bucket <> 8 then raise exception 'FAIL 7: casual filter bucket=% (want 8)', casual_bucket; end if;
  raise notice 'PASS 7: the mode filter shows one crowd';
end $$;

-- 8 + 9: anon executes neither aggregate
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'title_mode_scores'
      and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'FAIL 8: anon can execute title_mode_scores';
  end if;
  raise notice 'PASS 8: anon cannot execute title_mode_scores';
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'title_mode_histogram'
      and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'FAIL 9: anon can execute title_mode_histogram';
  end if;
  raise notice 'PASS 9: anon cannot execute title_mode_histogram';
end $$;

-- 10: a casual member with no preset seeds the enjoyment-heavy three
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('11111111-1111-1111-1111-111111111111', 'Casual Crew',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

do $$
declare n int; top_key text; top_weight int;
begin
  select count(*) into n from public.member_rubrics
    where group_id = '11111111-1111-1111-1111-111111111111'
      and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select category_key, weight into top_key, top_weight from public.member_rubrics
    where group_id = '11111111-1111-1111-1111-111111111111'
      and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    order by sort limit 1;
  if n <> 3 or top_key <> 'enjoyment' or top_weight <> 50 then
    raise exception 'FAIL 10: casual seed wrong (rows=%, top=% at %)', n, top_key, top_weight;
  end if;
  raise notice 'PASS 10: a casual member seeds the enjoyment-heavy three';
end $$;

-- 11: a buff member with no preset still seeds the base seven
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('22222222-2222-2222-2222-222222222222', 'Buff Brigade',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

do $$
declare n int;
begin
  select count(*) into n from public.member_rubrics
    where group_id = '22222222-2222-2222-2222-222222222222'
      and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 7 then raise exception 'FAIL 11: buff seed has % rows (want 7)', n; end if;
  raise notice 'PASS 11: a buff member still seeds the base seven';
end $$;

do $$ begin raise notice '=== ALL 11 TASTE-MODE ASSERTIONS PASSED ==='; end $$;

rollback;

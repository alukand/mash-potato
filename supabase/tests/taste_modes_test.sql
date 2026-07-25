-- Taste modes: profiles.taste_mode is self-editable only, the per-mode
-- community aggregates bucket raters by their CURRENT mode (each scored under
-- their own mode's weights), and seed_member_rubric follows the mode when no
-- ★ preset exists. Run with: npx supabase test db.

create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- name-based privilege probe (signature-free, overload-proof)
create function pg_temp.can_exec(p_role text, p_fn text) returns boolean
language sql as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_fn
      and has_function_privilege(p_role, p.oid, 'EXECUTE'))
$$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- 1: new accounts land casual (the migration backfilled pre-existing rows to buff)
select is(
  (select taste_mode from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'casual', 'a fresh profile defaults to casual');

-- ---- Ana switches sides ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

update public.profiles set taste_mode = 'buff'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select taste_mode from public.profiles
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'buff', 'you can switch your own mode');

-- 3: Ben cannot flip Ana (self-only update policy: zero rows touched)
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select results_eq(
  $$with up as (
      update public.profiles set taste_mode = 'casual'
        where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        returning 1)
    select count(*)::int from up$$,
  $$values (0)$$,
  'nobody can switch a mode for you');

-- 4: only the two modes exist
select throws_ok(
  $$update public.profiles set taste_mode = 'critic'
      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514', NULL,
  'unknown modes bounce off the check constraint');

-- ---- both crowds rate the same title ----
-- Ben (casual): the enjoyment-heavy card -> (9*50 + 7*25 + 7*25) / 100 = 8.0
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
        '{"enjoyment":9,"acting":7,"writing":7}');

-- Ana (buff): story only -> 6.0 under any story weight
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777',
        '{"story":6}');

-- 5: one row per crowd, each scored under its own weights
select results_eq(
  $$select mode, rating_count, round(mashed, 2)
      from public.title_mode_scores(
        '77777777-7777-7777-7777-777777777777',
        '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
        '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb)
      order by mode$$,
  $$values ('buff', 1, 6.00::numeric), ('casual', 1, 8.00::numeric)$$,
  'the two crowds aggregate separately, each on its own rubric');

-- 6: the everyone histogram carries both buckets
select results_eq(
  $$select bucket, n
      from public.title_mode_histogram(
        '77777777-7777-7777-7777-777777777777',
        '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
        '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb)
      order by bucket$$,
  $$values (6, 1), (8, 1)$$,
  'the everyone histogram spans both crowds');

-- 7: the casual filter narrows to the casual bucket
select results_eq(
  $$select bucket, n
      from public.title_mode_histogram(
        '77777777-7777-7777-7777-777777777777',
        '{"enjoyment":50,"acting":25,"writing":25}'::jsonb,
        '{"story":30,"acting":25,"writing":20,"cinematography":25,"pacing":15,"scoreSound":15,"emotionalImpact":25}'::jsonb,
        'casual')$$,
  $$values (8, 1)$$,
  'the mode filter shows one crowd');

-- 8 + 9: grants posture (anon executes nothing new)
select ok(not pg_temp.can_exec('anon', 'title_mode_scores'),
  'anon cannot execute title_mode_scores');
select ok(not pg_temp.can_exec('anon', 'title_mode_histogram'),
  'anon cannot execute title_mode_histogram');

-- ---- seeding follows the GROUP's mode when there is no preset ----
-- (Since 20260724120000 the group carries the mode; the profile's mode drives
-- solo ratings and only preselects this at creation time. See
-- group_taste_modes_test.sql for the full group-mode contract.)
-- 10: a casual GROUP -> the three-part casual core
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.groups (id, name, owner_id, taste_mode)
values ('11111111-1111-1111-1111-111111111111', 'Casual Crew',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'casual');
select results_eq(
  $$select category_key, weight from public.member_rubrics
      where group_id = '11111111-1111-1111-1111-111111111111'
        and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      order by sort$$,
  $$values ('enjoyment', 50), ('acting', 25), ('writing', 25)$$,
  'a casual member seeds the enjoyment-heavy three');

-- 11: Ana (buff, no ★ preset) creates a group -> the base seven
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('22222222-2222-2222-2222-222222222222', 'Buff Brigade',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from public.member_rubrics
    where group_id = '22222222-2222-2222-2222-222222222222'
      and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  7, 'a buff member still seeds the base seven');

select * from finish();
rollback;

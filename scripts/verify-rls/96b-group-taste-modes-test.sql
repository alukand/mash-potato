-- Group taste modes on vanilla Postgres: the GROUP's mode decides its rubric
-- (not each member's personal one), switching re-seeds every member, and only
-- the owner can switch. Mirrors supabase/tests/group_taste_modes_test.sql.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

-- 1: the column default keeps pre-existing groups on the craft rubric
insert into public.groups (id, name, owner_id)
values ('11111111-1111-1111-1111-111111111111', 'Legacy Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

do $$
declare v text; c int;
begin
  select taste_mode into v from public.groups
    where id = '11111111-1111-1111-1111-111111111111';
  if v <> 'buff' then raise exception 'FAIL 1: default group mode is % (want buff)', v; end if;
  select count(*) into c from public.member_rubrics
    where group_id = '11111111-1111-1111-1111-111111111111';
  if c <> 7 then raise exception 'FAIL 1: buff group seeded % rows (want 7)', c; end if;
  raise notice 'PASS 1: groups default to buff and seed the base seven';
end $$;

-- 2: a casual group seeds exactly three, ignoring the personal ★ preset
insert into public.user_rubrics (user_id, name, rows, is_favorite)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ana''s craft',
        '[{"key":"story","label":"Story","weight":40,"enabled":true,"sort":0},
          {"key":"themes","label":"Themes","weight":30,"enabled":true,"sort":1}]'::jsonb,
        true);

insert into public.groups (id, name, owner_id, taste_mode)
values ('22222222-2222-2222-2222-222222222222', 'Movie Night',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'casual');

do $$
declare c int; w int;
begin
  select count(*) into c from public.member_rubrics
    where group_id = '22222222-2222-2222-2222-222222222222';
  if c <> 3 then raise exception 'FAIL 2: casual group seeded % rows (want 3)', c; end if;
  select weight into w from public.member_rubrics
    where group_id = '22222222-2222-2222-2222-222222222222'
      and category_key = 'enjoyment';
  if w <> 50 then raise exception 'FAIL 2: enjoyment weight is % (want 50)', w; end if;
  raise notice 'PASS 2: a casual group seeds the three, ignoring the star preset';
end $$;

-- 3: the ★ preset still wins in a buff group
insert into public.groups (id, name, owner_id, taste_mode)
values ('33333333-3333-3333-3333-333333333333', 'Craft Club',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'buff');

do $$
declare w int; has_pacing boolean;
begin
  select weight into w from public.member_rubrics
    where group_id = '33333333-3333-3333-3333-333333333333'
      and category_key = 'story';
  if w <> 40 then raise exception 'FAIL 3: preset story weight is % (want 40)', w; end if;
  select exists (select 1 from public.member_rubrics
                   where group_id = '33333333-3333-3333-3333-333333333333'
                     and category_key = 'pacing') into has_pacing;
  if not has_pacing then raise exception 'FAIL 3: base coverage did not top up the preset'; end if;
  raise notice 'PASS 3: a buff group still honours the star preset plus base coverage';
end $$;

-- 4: a casual-by-profile member joining a buff group gets the craft rubric
update public.profiles set taste_mode = 'casual'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

insert into public.group_members (group_id, user_id, role)
values ('33333333-3333-3333-3333-333333333333',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

do $$
declare c int;
begin
  select count(*) into c from public.member_rubrics
    where group_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if c <> 7 then raise exception 'FAIL 4: joiner got % rows (want the group''s 7)', c; end if;
  raise notice 'PASS 4: the GROUP''s mode decides a joiner''s rubric, not their profile''s';
end $$;

-- 5: switching the mode re-seeds EVERY member
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

update public.groups set taste_mode = 'casual'
  where id = '33333333-3333-3333-3333-333333333333';

do $$
declare bad int; ben int;
begin
  select count(*) into bad from public.member_rubrics
    where group_id = '33333333-3333-3333-3333-333333333333'
      and category_key not in ('enjoyment', 'acting', 'writing');
  if bad <> 0 then raise exception 'FAIL 5: % stale rows survived the switch', bad; end if;
  select count(*) into ben from public.member_rubrics
    where group_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if ben <> 3 then raise exception 'FAIL 5: the re-seed missed a non-owner (rows=%)', ben; end if;
  raise notice 'PASS 5: switching re-seeds every member, owner and not';
end $$;

-- 6: a non-owner cannot switch the group's mode
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int; v text;
begin
  with up as (
    update public.groups set taste_mode = 'buff'
      where id = '22222222-2222-2222-2222-222222222222'
      returning 1)
  select count(*) into c from up;
  select taste_mode into v from public.groups
    where id = '22222222-2222-2222-2222-222222222222';
  if c <> 0 or v <> 'casual' then
    raise exception 'FAIL 6: a member changed the group mode (rows=%, mode=%)', c, v;
  end if;
  raise notice 'PASS 6: only the owner can change how the group scores';
end $$;

-- 7: the re-seed trigger is a trigger internal, ungranted (GRANTS LAW)
do $$
begin
  if has_function_privilege('authenticated', 'public.reseed_group_rubrics()', 'EXECUTE') then
    raise exception 'FAIL 7: authenticated can execute reseed_group_rubrics';
  end if;
  if has_function_privilege('anon', 'public.reseed_group_rubrics()', 'EXECUTE') then
    raise exception 'FAIL 7: anon can execute reseed_group_rubrics';
  end if;
  raise notice 'PASS 7: reseed_group_rubrics is sealed from the API roles';
end $$;

do $$ begin raise notice '=== GROUP TASTE MODES: 7/7 PASSED ==='; end $$;

rollback;

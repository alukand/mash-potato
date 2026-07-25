-- Group taste modes: the GROUP's mode decides its rubric, not each member's
-- personal one, and switching modes re-seeds every member. Run with:
--   npx supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

-- ---- the column's default keeps every pre-existing group on the craft rubric
insert into public.groups (id, name, owner_id)
values ('11111111-1111-1111-1111-111111111111', 'Legacy Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is(
  (select taste_mode from public.groups where id = '11111111-1111-1111-1111-111111111111'),
  'buff',
  'a group created without a mode defaults to buff (existing groups unchanged)');

select is(
  (select count(*)::int from public.member_rubrics
     where group_id = '11111111-1111-1111-1111-111111111111'
       and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  7,
  'a buff group seeds the base seven');

-- ---- a casual group seeds three, and ignores the personal ★ preset --------
-- Ana's preset would win in a buff group; a casual group is a
-- no-configuration surface, so the group's three rows are the rubric.
insert into public.user_rubrics (user_id, name, rows, is_favorite)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ana''s craft',
        '[{"key":"story","label":"Story","weight":40,"enabled":true,"sort":0},
          {"key":"themes","label":"Themes","weight":30,"enabled":true,"sort":1}]'::jsonb,
        true);

insert into public.groups (id, name, owner_id, taste_mode)
values ('22222222-2222-2222-2222-222222222222', 'Movie Night',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'casual');

select set_eq(
  $$select category_key from public.member_rubrics
      where group_id = '22222222-2222-2222-2222-222222222222'
        and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values ('enjoyment'), ('acting'), ('writing')$$,
  'a casual group seeds exactly the three casual rows, ignoring the ★ preset');

select is(
  (select weight from public.member_rubrics
     where group_id = '22222222-2222-2222-2222-222222222222'
       and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and category_key = 'enjoyment'),
  50,
  'enjoyment carries half the casual card');

-- the ★ preset still wins in a buff group (existing behavior intact)
insert into public.groups (id, name, owner_id, taste_mode)
values ('33333333-3333-3333-3333-333333333333', 'Craft Club',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'buff');

select is(
  (select weight from public.member_rubrics
     where group_id = '33333333-3333-3333-3333-333333333333'
       and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       and category_key = 'story'),
  40,
  'a buff group still honours the ★ preset verbatim');

select ok(
  exists (select 1 from public.member_rubrics
            where group_id = '33333333-3333-3333-3333-333333333333'
              and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
              and category_key = 'pacing'),
  'a buff group still tops the preset up with missing base categories');

-- ---- a joiner gets the GROUP's rubric, not their personal mode's ----------
-- Ben is a casual rater by profile; joining a buff group he scores the craft
-- rubric, which is exactly what the group-level mode is for.
update public.profiles set taste_mode = 'casual'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

insert into public.group_members (group_id, user_id, role)
values ('33333333-3333-3333-3333-333333333333',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

select is(
  (select count(*)::int from public.member_rubrics
     where group_id = '33333333-3333-3333-3333-333333333333'
       and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  7,
  'a casual-by-profile member joining a buff group gets the craft rubric');

insert into public.group_members (group_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

select is(
  (select count(*)::int from public.member_rubrics
     where group_id = '22222222-2222-2222-2222-222222222222'
       and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  3,
  'and joining a casual group gets the three');

-- ---- switching the mode re-seeds EVERY member -----------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

update public.groups set taste_mode = 'casual'
  where id = '33333333-3333-3333-3333-333333333333';

select set_eq(
  $$select distinct category_key from public.member_rubrics
      where group_id = '33333333-3333-3333-3333-333333333333'$$,
  $$values ('enjoyment'), ('acting'), ('writing')$$,
  'switching to casual re-seeds every member, preset rows and all');

select is(
  (select count(*)::int from public.member_rubrics
     where group_id = '33333333-3333-3333-3333-333333333333'
       and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  3,
  'the re-seed reaches members who are not the owner');

-- ---- a non-owner cannot change how the group scores -----------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

update public.groups set taste_mode = 'buff'
  where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select taste_mode from public.groups where id = '22222222-2222-2222-2222-222222222222'),
  'casual',
  'a member cannot switch the group''s mode (groups_update_owner)');

-- GRANTS LAW: the re-seed is a trigger internal, not an API.
reset role;
select ok(
  not has_function_privilege('authenticated', 'public.reseed_group_rubrics()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reseed_group_rubrics()', 'EXECUTE'),
  'reseed_group_rubrics is sealed from the API roles');

select * from finish();
rollback;

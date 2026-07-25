-- member_rubrics: group-visible, self-writable, seeded on join. Plain SQL for
-- vanilla Postgres. Cast: Ana (owner), Ben (member), Cara (outsider).

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

-- This file tests the BUFF seeding path (fresh profiles default casual since
-- taste modes; the casual path lives in 96-taste-modes-test.sql).
update public.profiles set taste_mode = 'buff';

-- ---- Ana creates the group; the trigger chain seeds her rubric ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

do $$
declare c int;
begin
  select count(*) into c from public.member_rubrics
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if c <> 7 then raise exception 'FAIL 1: owner rubric not seeded on group creation (rows=%)', c; end if;
  raise notice 'PASS 1: creating a group seeds the owner''s default rubric (base seven)';
end $$;

-- ---- Ana adds Ben; his rubric is seeded too ----
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

do $$
declare c int;
begin
  select count(*) into c from public.member_rubrics;
  if c <> 14 then raise exception 'FAIL 2: expected 14 rubric rows after Ben joined (rows=%)', c; end if;
  raise notice 'PASS 2: adding a member seeds their default rubric (14 rows total)';
end $$;

-- ---- Ben can see everyone's rubric in his group (needed to mash) ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int;
begin
  select count(distinct user_id) into c from public.member_rubrics
    where group_id = '99999999-9999-9999-9999-999999999999';
  if c <> 2 then raise exception 'FAIL 3: Ben sees % members'' rubrics (want 2)', c; end if;
  raise notice 'PASS 3: a member reads the whole group''s rubrics (for mashing)';
end $$;

-- ---- Ben edits his own weight, but cannot touch Ana's ----
update public.member_rubrics set weight = 50
  where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and category_key = 'story';

do $$
declare c int;
begin
  with up as (
    update public.member_rubrics set weight = 1
      where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category_key = 'story'
      returning 1)
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 4: Ben modified Ana''s rubric (rows=%)', c; end if;
  raise notice 'PASS 4: Ben edits his own rubric only';
end $$;

-- ---- Cara (outsider) sees nothing ----
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.member_rubrics;
  if c <> 0 then raise exception 'FAIL 5: outsider sees % rubric rows', c; end if;
  raise notice 'PASS 5: an outsider sees no rubrics';
end $$;

-- ---- ★ preset seeding gets base coverage ----
-- Cara saved a favorite preset BEFORE Emotional Impact joined the base set
-- (base six, Story deliberately disabled). Joining must copy her preset AND
-- fill the missing base category; her deliberate disable sticks.
insert into public.user_rubrics (user_id, name, is_favorite, rows)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Old six', true,
        '[{"key":"story","label":"Story","weight":30,"enabled":false,"sort":0},
          {"key":"acting","label":"Acting","weight":25,"enabled":true,"sort":1},
          {"key":"writing","label":"Writing","weight":20,"enabled":true,"sort":2},
          {"key":"cinematography","label":"Cinematography","weight":25,"enabled":true,"sort":3},
          {"key":"pacing","label":"Pacing","weight":15,"enabled":true,"sort":4},
          {"key":"scoreSound","label":"Score & Soundtrack","weight":15,"enabled":true,"sort":5}]');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
declare w int; en boolean;
begin
  select weight, enabled into w, en from public.member_rubrics
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      and category_key = 'emotionalImpact';
  if w is distinct from 25 or en is distinct from true then
    raise exception 'FAIL 6: base-six preset did not gain emotionalImpact at 25/enabled (got %/%)', w, en;
  end if;
  raise notice 'PASS 6: a base-six preset gains the missing base category at its default weight';
end $$;

do $$
declare en boolean;
begin
  select enabled into en from public.member_rubrics
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      and category_key = 'story';
  if en is distinct from false then
    raise exception 'FAIL 7: preset''s deliberate disable was overridden (enabled=%)', en;
  end if;
  raise notice 'PASS 7: a base category the preset deliberately disabled stays disabled';
end $$;

do $$ begin raise notice '=== ALL 7 MEMBER-RUBRICS ASSERTIONS PASSED ==='; end $$;

rollback;

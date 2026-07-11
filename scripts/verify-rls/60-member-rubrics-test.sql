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
  if c <> 6 then raise exception 'FAIL 1: owner rubric not seeded on group creation (rows=%)', c; end if;
  raise notice 'PASS 1: creating a group seeds the owner''s default rubric (6 rows)';
end $$;

-- ---- Ana adds Ben; his rubric is seeded too ----
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

do $$
declare c int;
begin
  select count(*) into c from public.member_rubrics;
  if c <> 12 then raise exception 'FAIL 2: expected 12 rubric rows after Ben joined (rows=%)', c; end if;
  raise notice 'PASS 2: adding a member seeds their default rubric (12 rows total)';
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

do $$ begin raise notice '=== ALL 5 MEMBER-RUBRICS ASSERTIONS PASSED ==='; end $$;

rollback;

-- member_rubrics: group-visible, self-writable, seeded on join.
-- Run with: npx supabase test db.

create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is(
  (select count(*)::int from public.member_rubrics
     where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  6, 'creating a group seeds the owner''s default rubric');

insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

select is(
  (select count(*)::int from public.member_rubrics), 12,
  'adding a member seeds their default rubric');

-- Ben sees the whole group's rubrics (needed to mash them).
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(distinct user_id)::int from public.member_rubrics
     where group_id = '99999999-9999-9999-9999-999999999999'),
  2, 'a member reads the whole group''s rubrics');

-- Ben edits only his own rows.
select results_eq(
  $$
  with up as (
    update public.member_rubrics set weight = 1
      where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category_key = 'story'
      returning 1)
  select count(*)::int from up
  $$,
  $$values (0)$$,
  'a member cannot modify another member''s rubric');

-- An outsider sees nothing.
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::int from public.member_rubrics), 0,
  'an outsider sees no rubrics');

select * from finish();
rollback;

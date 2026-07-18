-- Group polls: owner-gated votes on what to watch next.
-- Run with: npx supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('11111111-1111-1111-1111-111111111111', 508442, 'movie', 'Soul', 2020),
       ('22222222-2222-2222-2222-222222222222', 693134, 'movie', 'Dune: Part Two', 2024),
       ('33333333-3333-3333-3333-333333333333', 129, 'movie', 'Spirited Away', 2001);

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Vote Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- ================= creation is owner-only =================
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222']::uuid[])$$,
  'P0001', 'only the group owner can start a vote',
  'polls: a member cannot start a vote');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111']::uuid[])$$,
  'P0001', 'a vote needs 2 to 5 options',
  'polls: a single option is not a vote');

select lives_ok(
  $$select public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333']::uuid[])$$,
  'polls: the owner opens a vote with three options');

select throws_ok(
  $$select public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222']::uuid[])$$,
  'P0001', 'this group already has an open vote',
  'polls: one open vote per group');

-- ================= visibility =================
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::int from public.group_polls),
  0, 'polls: an outsider sees no polls');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.group_polls
     where group_id = '99999999-9999-9999-9999-999999999999'),
  1, 'polls: a member sees the vote');
select is(
  (select count(*)::int from public.poll_options),
  3, 'polls: a member sees the options');

-- ================= voting =================
select lives_ok(
  $$insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    from public.poll_options o where o.sort = 2$$,
  'votes: a member casts their vote');

select throws_ok(
  $$insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    from public.poll_options o where o.sort = 1$$,
  '42501', null,
  'votes: nobody votes on someone else''s behalf');

-- switching = upsert onto the same (poll, member) key
select lives_ok(
  $$insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    from public.poll_options o where o.sort = 3
    on conflict (poll_id, member_id)
      do update set option_id = excluded.option_id$$,
  'votes: switching your vote is one upsert');

select throws_ok(
  $$select public.close_group_poll(
      (select id from public.group_polls where status = 'open'))$$,
  'P0001', 'only the group owner can close the vote',
  'close: a member cannot close the vote');

-- Ana votes option 3 too: 2 votes for sort-3, 0 elsewhere.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.poll_votes (poll_id, option_id, member_id)
  select o.poll_id, o.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  from public.poll_options o where o.sort = 3;

select lives_ok(
  $$select public.close_group_poll(
      (select id from public.group_polls where status = 'open'))$$,
  'close: the owner closes the vote');

select is(
  (select o.sort from public.group_polls p
     join public.poll_options o on o.id = p.winner_option_id
     where p.group_id = '99999999-9999-9999-9999-999999999999'),
  3, 'close: the most-voted option wins');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    from public.poll_options o where o.sort = 1
    on conflict (poll_id, member_id)
      do update set option_id = excluded.option_id$$,
  '42501', null,
  'votes: a closed vote takes no more ballots');

select * from finish();
rollback;

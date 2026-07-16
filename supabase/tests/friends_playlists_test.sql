-- Public profiles + playlists. Group memberships show on public profiles BY
-- DEFAULT (owner decision 2026-07-14); everything else stays opt-in.
-- Run with: npx supabase test db

create extension if not exists pgtap with schema extensions;

begin;
select plan(25);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year, poster_path)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024, '/dune2.jpg');

-- ================= group visibility on the public profile ===================
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Ben looks at Ana's profile: name yes, groups visible BY DEFAULT.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'displayName'),
  'Ana', 'public profile: the display name shows');
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'groups' -> 0 ->> 'name'),
  'Test Crew', 'public profile: group memberships show by default');

-- Ben cannot flip visibility on a group he is not in.
select throws_ok(
  $$select public.set_group_visibility('99999999-9999-9999-9999-999999999999', true)$$,
  'P0001', 'not a member of this group',
  'visibility: only members flip their own membership');

-- Ana hides the group; Ben no longer sees it. The toggle still works.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.set_group_visibility('99999999-9999-9999-9999-999999999999', false)$$,
  'visibility: a member hides their own membership');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select jsonb_array_length(public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'groups')),
  0, 'public profile: a hidden group disappears');

-- ============================ playlists =====================================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- explicitly private: the default is public now, and this block proves the
-- private path still holds
insert into public.playlists (id, owner_id, name, is_public)
values ('55555555-5555-5555-5555-555555555555',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rainy Day Horror', false);
insert into public.playlist_items (playlist_id, title_id)
values ('55555555-5555-5555-5555-555555555555',
        '77777777-7777-7777-7777-777777777777');

select is(
  (select count(*)::int from public.playlists), 1,
  'playlists: the owner sees their private playlist');

-- Ben sees nothing: playlist and items are private by default.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.playlists), 0,
  'playlists: private playlists are invisible to others');
select is(
  (select count(*)::int from public.playlist_items), 0,
  'playlists: private items are invisible to others');
select is(
  (select jsonb_array_length(public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'playlists')),
  0, 'public profile: private playlists do not appear');

-- Ana flips it public; Ben can browse it (read-only).
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
update public.playlists set is_public = true
  where id = '55555555-5555-5555-5555-555555555555';

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.playlist_items), 1,
  'playlists: public playlist items are browsable');
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'playlists' -> 0 ->> 'itemCount'),
  '1', 'public profile: public playlists appear with their item count');

-- ...but never writable by anyone else.
select throws_ok(
  $$insert into public.playlist_items (playlist_id, title_id)
    values ('55555555-5555-5555-5555-555555555555',
            '77777777-7777-7777-7777-777777777777')$$,
  '42501', null,
  'playlists: others cannot add to a public playlist');
select results_eq(
  $$
  with up as (
    update public.playlists set name = 'Hijacked'
      where id = '55555555-5555-5555-5555-555555555555'
      returning 1)
  select count(*)::int from up
  $$,
  $$values (0)$$,
  'playlists: others cannot rename a public playlist');
select results_eq(
  $$
  with del as (
    delete from public.playlist_items
      where playlist_id = '55555555-5555-5555-5555-555555555555'
      returning 1)
  select count(*)::int from del
  $$,
  $$values (0)$$,
  'playlists: others cannot remove items from a public playlist');

-- ==================== group watchlists ======================================
-- Ana creates a shared list on her group; outsiders see nothing, members
-- curate it, and it can never go public.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.playlists (id, owner_id, group_id, name)
values ('44444444-4444-4444-4444-444444444444',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '99999999-9999-9999-9999-999999999999', 'Friday Queue');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.playlists
     where id = '44444444-4444-4444-4444-444444444444'),
  0, 'watchlists: outsiders never see a group watchlist');

-- Ana adds Ben to the group; now he reads AND curates it.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.playlists
     where id = '44444444-4444-4444-4444-444444444444'),
  1, 'watchlists: members see the group watchlist');
select lives_ok(
  $$insert into public.playlist_items (playlist_id, title_id)
    values ('44444444-4444-4444-4444-444444444444',
            '77777777-7777-7777-7777-777777777777')$$,
  'watchlists: any member adds a title');
select lives_ok(
  $$delete from public.playlist_items
    where playlist_id = '44444444-4444-4444-4444-444444444444'$$,
  'watchlists: any member removes a title');

-- Group lists never go public, and never appear on a public profile.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$update public.playlists set is_public = true
      where id = '44444444-4444-4444-4444-444444444444'$$,
  '23514', null,
  'watchlists: a group watchlist cannot be made public');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int
     from jsonb_array_elements(
       public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'playlists') e
     where e ->> 'name' = 'Friday Queue'),
  0, 'watchlists: group lists stay off public profiles');

-- ---- avatars: self-picked, and the public profile carries them ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$update public.profiles set avatar_key = 'vampire'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'avatars: a user picks their own avatar');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'avatarKey'),
  'vampire', 'avatars: the public profile carries the picked avatar');
select results_eq(
  $$
  with up as (
    update public.profiles set avatar_key = 'clown'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      returning 1)
  select count(*)::int from up
  $$,
  $$values (0)$$,
  'avatars: nobody restyles someone else');

-- ---- personal playlists default to PUBLIC (2026-07-16) ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.playlists (id, owner_id, name)
values ('33333333-3333-3333-3333-333333333333',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Defaults Check');
select is(
  (select is_public from public.playlists
     where id = '33333333-3333-3333-3333-333333333333'),
  true, 'playlists: a new personal playlist is public by default');
-- ...while a bare group-list insert stays pinned private (trigger).
insert into public.playlists (id, owner_id, group_id, name)
values ('22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '99999999-9999-9999-9999-999999999999', 'Group Defaults Check');
select is(
  (select is_public from public.playlists
     where id = '22222222-2222-2222-2222-222222222222'),
  false, 'playlists: a new group watchlist stays private despite the default');

select * from finish();
rollback;

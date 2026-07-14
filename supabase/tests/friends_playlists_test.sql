-- Public profiles + playlists: private by default in every direction.
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
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year, poster_path)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024, '/dune2.jpg');

-- ================= group visibility on the public profile ===================
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Ben looks at Ana's profile: name yes, groups hidden by default.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'displayName'),
  'Ana', 'public profile: the display name shows');
select is(
  (select jsonb_array_length(public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'groups')),
  0, 'public profile: group memberships are PRIVATE by default');

-- Ben cannot flip visibility on a group he is not in.
select throws_ok(
  $$select public.set_group_visibility('99999999-9999-9999-9999-999999999999', true)$$,
  'P0001', 'not a member of this group',
  'visibility: only members flip their own membership');

-- Ana shows the group off; Ben now sees it.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.set_group_visibility('99999999-9999-9999-9999-999999999999', true)$$,
  'visibility: a member flips their own membership public');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'groups' -> 0 ->> 'name'),
  'Test Crew', 'public profile: a shown group appears with its name');

-- ============================ playlists =====================================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.playlists (id, owner_id, name)
values ('55555555-5555-5555-5555-555555555555',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rainy Day Horror');
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

select * from finish();
rollback;

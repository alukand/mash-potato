-- Public profiles + playlists on vanilla PostgreSQL. Group memberships show
-- on public profiles BY DEFAULT (owner decision 2026-07-14); playlists and
-- ratings stay opt-in. Group watchlists are member-shared and never public.
-- Cast: Ana (owner), Ben (another authenticated user, not in Ana's group).

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year, poster_path)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024, '/dune2.jpg');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- explicitly private: the default is public now; this proves hiding works
insert into public.playlists (id, owner_id, name, is_public)
values ('55555555-5555-5555-5555-555555555555',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rainy Day Horror', false);
insert into public.playlist_items (playlist_id, title_id)
values ('55555555-5555-5555-5555-555555555555',
        '77777777-7777-7777-7777-777777777777');

-- PASS 1: groups show by default; playlists stay hidden until flipped
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare prof jsonb;
begin
  prof := public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if prof ->> 'displayName' is distinct from 'Ana' then
    raise exception 'FAIL 1: display name missing from public profile';
  end if;
  if prof -> 'groups' -> 0 ->> 'name' is distinct from 'Test Crew' then
    raise exception 'FAIL 1: group membership hidden despite public default (%).', prof;
  end if;
  if jsonb_array_length(prof -> 'playlists') <> 0 then
    raise exception 'FAIL 1: playlists leaked while private (%).', prof;
  end if;
  raise notice 'PASS 1: groups show by default, playlists stay opt-in';
end $$;

-- PASS 2: private playlists and items are invisible to others
do $$
declare pc int; ic int;
begin
  select count(*) into pc from public.playlists;
  select count(*) into ic from public.playlist_items;
  if pc <> 0 or ic <> 0 then
    raise exception 'FAIL 2: Ben sees % playlists and % items', pc, ic;
  end if;
  raise notice 'PASS 2: private playlists are invisible to others';
end $$;

-- PASS 3: only members flip their own group visibility
do $$
begin
  begin
    perform public.set_group_visibility('99999999-9999-9999-9999-999999999999', true);
    raise exception 'FAIL 3: a non-member flipped group visibility';
  exception when raise_exception then
    if sqlerrm = 'not a member of this group' then
      raise notice 'PASS 3: only members flip their own membership visibility';
    else raise; end if;
  end;
end $$;

-- Ana goes public with both.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.set_group_visibility('99999999-9999-9999-9999-999999999999', true);
update public.playlists set is_public = true
  where id = '55555555-5555-5555-5555-555555555555';

-- PASS 4: shown groups and public playlists appear on the profile
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare prof jsonb; ic int;
begin
  prof := public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if prof -> 'groups' -> 0 ->> 'name' is distinct from 'Test Crew' then
    raise exception 'FAIL 4: shown group missing (%).', prof;
  end if;
  if (prof -> 'playlists' -> 0 ->> 'itemCount')::int <> 1 then
    raise exception 'FAIL 4: public playlist missing or wrong count (%).', prof;
  end if;
  select count(*) into ic from public.playlist_items;
  if ic <> 1 then raise exception 'FAIL 4: public items not browsable (rows=%)', ic; end if;
  raise notice 'PASS 4: shown groups + public playlists appear, items browsable';
end $$;

-- PASS 5: public never means writable
do $$
declare c int;
begin
  begin
    insert into public.playlist_items (playlist_id, title_id)
    values ('55555555-5555-5555-5555-555555555555',
            '77777777-7777-7777-7777-777777777777');
    raise exception 'FAIL 5: Ben added to a public playlist';
  exception when insufficient_privilege then null;
  end;
  with up as (
    update public.playlists set name = 'Hijacked'
      where id = '55555555-5555-5555-5555-555555555555'
      returning 1)
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 5: Ben renamed a public playlist'; end if;
  with del as (
    delete from public.playlist_items
      where playlist_id = '55555555-5555-5555-5555-555555555555'
      returning 1)
  select count(*) into c from del;
  if c <> 0 then raise exception 'FAIL 5: Ben removed public playlist items'; end if;
  raise notice 'PASS 5: public playlists stay read-only for everyone else';
end $$;

-- PASS 6: avatars are self-picked, public, and never someone else's to change
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
update public.profiles set avatar_key = 'vampire'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare v text; c int;
begin
  select public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'avatarKey' into v;
  if v is distinct from 'vampire' then
    raise exception 'FAIL 6: public profile avatarKey is % (want vampire)', v;
  end if;
  with up as (
    update public.profiles set avatar_key = 'clown'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      returning 1)
  select count(*) into c from up;
  if c <> 0 then raise exception 'FAIL 6b: Ben restyled Ana''s avatar'; end if;
  raise notice 'PASS 6: avatars are self-picked and ride the public profile';
end $$;

-- PASS 7: group watchlists — member-shared, outsider-invisible, never public
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.playlists (id, owner_id, group_id, name)
values ('44444444-4444-4444-4444-444444444444',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '99999999-9999-9999-9999-999999999999', 'Friday Queue');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.playlists
    where id = '44444444-4444-4444-4444-444444444444';
  if c <> 0 then raise exception 'FAIL 7: an outsider saw a group watchlist'; end if;
  raise notice 'PASS 7: outsiders never see a group watchlist';
end $$;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int; prof jsonb;
begin
  select count(*) into c from public.playlists
    where id = '44444444-4444-4444-4444-444444444444';
  if c <> 1 then raise exception 'FAIL 8: a member cannot see the group watchlist'; end if;
  insert into public.playlist_items (playlist_id, title_id)
  values ('44444444-4444-4444-4444-444444444444',
          '77777777-7777-7777-7777-777777777777');
  delete from public.playlist_items
    where playlist_id = '44444444-4444-4444-4444-444444444444';
  select count(*) into c
    from jsonb_array_elements(
      public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') -> 'playlists') e
    where e ->> 'name' = 'Friday Queue';
  if c <> 0 then raise exception 'FAIL 8: a group watchlist reached a public profile'; end if;
  raise notice 'PASS 8: members curate the group watchlist; it stays inside the group';
end $$;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  begin
    update public.playlists set is_public = true
      where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAIL 9: a group watchlist was made public';
  exception when check_violation then
    raise notice 'PASS 9: a group watchlist can never be made public';
  end;
end $$;

-- PASS 10: personal playlists default public; group lists stay pinned private
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.playlists (id, owner_id, name)
values ('33333333-3333-3333-3333-333333333333',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Defaults Check');
insert into public.playlists (id, owner_id, group_id, name)
values ('22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '99999999-9999-9999-9999-999999999999', 'Group Defaults Check');
do $$
declare pub boolean; grp boolean;
begin
  select is_public into pub from public.playlists
    where id = '33333333-3333-3333-3333-333333333333';
  select is_public into grp from public.playlists
    where id = '22222222-2222-2222-2222-222222222222';
  if pub is distinct from true then
    raise exception 'FAIL 10: a new personal playlist is not public by default';
  end if;
  if grp is distinct from false then
    raise exception 'FAIL 10b: a new group watchlist escaped the private pin';
  end if;
  raise notice 'PASS 10: personal playlists default public; group lists stay private';
end $$;

do $$ begin raise notice '=== ALL 10 FRIENDS/PLAYLISTS ASSERTIONS PASSED ==='; end $$;

rollback;

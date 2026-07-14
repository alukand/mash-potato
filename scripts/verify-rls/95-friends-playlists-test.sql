-- Public profiles + playlists on vanilla PostgreSQL: private by default.
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

insert into public.playlists (id, owner_id, name)
values ('55555555-5555-5555-5555-555555555555',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rainy Day Horror');
insert into public.playlist_items (playlist_id, title_id)
values ('55555555-5555-5555-5555-555555555555',
        '77777777-7777-7777-7777-777777777777');

-- PASS 1: everything is private by default on the public profile
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare prof jsonb;
begin
  prof := public.public_profile('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if prof ->> 'displayName' is distinct from 'Ana' then
    raise exception 'FAIL 1: display name missing from public profile';
  end if;
  if jsonb_array_length(prof -> 'groups') <> 0
     or jsonb_array_length(prof -> 'playlists') <> 0 then
    raise exception 'FAIL 1: groups/playlists leaked while private (%).', prof;
  end if;
  raise notice 'PASS 1: public profile shows the name, hides everything else by default';
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

do $$ begin raise notice '=== ALL 5 FRIENDS/PLAYLISTS ASSERTIONS PASSED ==='; end $$;

rollback;

-- Seasons and episodes as titles of their own. Run with:
--   npx supabase test db
--
-- Ana creates Season 2 and S2E3 of a show BEFORE anyone has added the show
-- itself, then the show, which is the order that would break a lookup that
-- forgot parts share the show's TMDB id.

create extension if not exists pgtap with schema extensions;

begin;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ana@test.dev',
        jsonb_build_object('display_name', 'Ana'), now(), now());
update public.profiles set accepted_terms_at = now();

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

create temp table ids (name text primary key, id uuid not null);
insert into ids select 'season', public.ensure_tv_part(990101, 2, null, 'Severance', 'Season 2', 2025, '/s2.jpg');
insert into ids select 'episode', public.ensure_tv_part(990101, 2, 3, 'Severance', 'Who Is Alive?', 2025, null);
insert into ids select 'specials', public.ensure_tv_part(990101, 0, null, 'Severance', 'Specials', null, null);
insert into ids select 'show', public.ensure_title(990101, 'tv', 'Severance', 2022, '/show.jpg');

-- ---- naming and identity ------------------------------------------------------
select is((select name from public.titles where id = (select id from ids where name = 'season')),
  'Severance Season 2', 'a season is named for its show and number');
select is((select name from public.titles where id = (select id from ids where name = 'episode')),
  'Severance S2E3', 'an episode is named SxEy');
select is((select name from public.titles where id = (select id from ids where name = 'specials')),
  'Severance Specials', 'season 0 is the Specials');
select is((select part_name from public.titles where id = (select id from ids where name = 'episode')),
  'Who Is Alive?', 'TMDB''s own episode name is kept');
select is((select year from public.titles where id = (select id from ids where name = 'season')),
  2025, 'a part carries its own air year');
select is((select count(distinct id)::int from ids), 4,
  'show, season, episode and specials are four rows');
select is((select season_number is null and episode_number is null and part_name is null
             from public.titles where id = (select id from ids where name = 'show')),
  true, 'the show row is not a part, though its parts were added first');
select is(public.ensure_title(990101, 'tv', 'Severance', 2022, '/show.jpg'),
  (select id from ids where name = 'show'), 'ensure_title finds the show, never one of its parts');
select is(public.ensure_tv_part(990101, 2, null, 'Severance', 'Season 2', 2025, '/s2.jpg'),
  (select id from ids where name = 'season'), 'ensure_tv_part is idempotent for a season');
select is(public.ensure_tv_part(990101, 2, 3, 'Severance', 'Who Is Alive?', 2025, null),
  (select id from ids where name = 'episode'), 'and for an episode');

-- ---- the table's own rules ----------------------------------------------------
select throws_ok(
  $$insert into public.titles (tmdb_id, media_type, name, season_number, episode_number)
    values (990101, 'tv', 'dupe', 2, 3)$$,
  '23505', null, 'a part cannot be stored twice');
select throws_ok(
  $$insert into public.titles (tmdb_id, media_type, name) values (990101, 'tv', 'dupe show')$$,
  '23505', null, 'nor can the show');
select throws_ok(
  $$insert into public.titles (tmdb_id, media_type, name, season_number)
    values (880001, 'movie', 'Film Season 1', 1)$$,
  '23514', null, 'a film has no seasons');
select throws_ok(
  $$insert into public.titles (tmdb_id, media_type, name, episode_number)
    values (990101, 'tv', 'orphan', 4)$$,
  '23514', null, 'an episode needs a season');
select lives_ok(
  $$insert into public.titles (tmdb_id, media_type, name)
    values (null, 'movie', 'Home Movie'), (null, 'movie', 'Home Movie')$$,
  'manual titles still never collide');

-- ---- ensure_tv_part refuses bad input -------------------------------------------
select throws_ok($$select public.ensure_tv_part(990101, -1, null, 'Severance', null, null, null)$$,
  'P0001', 'that season is not usable', 'season numbers run 0 to 999');
select throws_ok($$select public.ensure_tv_part(990101, 1, 10000, 'Severance', null, null, null)$$,
  'P0001', 'that episode is not usable', 'episode numbers run 0 to 9999');
select throws_ok($$select public.ensure_tv_part(0, 1, 1, 'Severance', null, null, null)$$,
  'P0001', 'that show id is not usable', 'a part needs a real show id');
select throws_ok($$select public.ensure_tv_part(990101, 1, 1, '   ', null, null, null)$$,
  'P0001', 'that show name is not usable', 'a part needs its show''s name');
select throws_ok($$select public.ensure_tv_part(990101, 1, 1, 'Severance', E'Bad\nName', null, null)$$,
  'P0001', 'that season or episode name is not usable', 'control characters stay out of part names');
select throws_ok(
  $$select public.ensure_tv_part(990101, 1, 1, 'Severance', null, null, 'https://evil.example/x.jpg')$$,
  'P0001', 'that poster path is not usable', 'poster paths are TMDB paths only');

-- ---- who may call it ------------------------------------------------------------
select ok(not has_function_privilege('anon',
  'public.ensure_tv_part(integer,integer,integer,text,text,integer,text)', 'execute'),
  'anon cannot create parts');
select ok(has_function_privilege('authenticated',
  'public.ensure_tv_part(integer,integer,integer,text,text,integer,text)', 'execute'),
  'a signed-in user can');
select ok(not has_table_privilege('authenticated', 'public.titles', 'insert'),
  'titles still take no direct writes');

set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$select public.ensure_tv_part(990101, 1, 1, 'Severance', null, null, null)$$,
  'P0001', 'sign in first', 'signed out, nothing is created');

-- ---- a part is rated like any title -------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$insert into public.global_ratings (user_id, title_id, scores)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            (select id from public.titles
              where tmdb_id = 990101 and season_number = 2 and episode_number = 3),
            '{"story": 8}')$$,
  'an episode takes a solo rating');
select lives_ok(
  $$insert into public.global_ratings (user_id, title_id, scores)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            (select id from public.titles
              where tmdb_id = 990101 and media_type = 'tv' and season_number is null),
            '{"story": 6}')$$,
  'separately from the show');
reset role;

select finish();
rollback;

-- Seasons and episodes on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/tv_parts_test.sql.
--
-- Run after 20-grants.sql, so it also proves titles stay closed to direct
-- client writes on a project whose defaults hand every role everything.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now());
update public.profiles set accepted_terms_at = now();

-- PASS 1: parts are created only through the definer RPC, and never signed out.
do $$
begin
  if has_table_privilege('authenticated', 'public.titles', 'INSERT')
     or has_table_privilege('authenticated', 'public.titles', 'UPDATE') then
    raise exception 'FAIL 1: authenticated can write titles directly';
  end if;
  if has_function_privilege('anon',
       'public.ensure_tv_part(integer,integer,integer,text,text,integer,text)', 'EXECUTE') then
    raise exception 'FAIL 1: anon can execute ensure_tv_part';
  end if;
  if not has_function_privilege('authenticated',
       'public.ensure_tv_part(integer,integer,integer,text,text,integer,text)', 'EXECUTE') then
    raise exception 'FAIL 1: a signed-in user cannot execute ensure_tv_part';
  end if;
  raise notice 'PASS 1: parts come only from ensure_tv_part, which anon cannot call';
end $$;

-- PASS 2: parts first, then the show; every lookup keeps them apart.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_season  uuid := public.ensure_tv_part(990101, 2, null, 'Severance', 'Season 2', 2025, null);
  v_episode uuid := public.ensure_tv_part(990101, 2, 3, 'Severance', 'Who Is Alive?', 2025, null);
  v_show    uuid := public.ensure_title(990101, 'tv', 'Severance', 2022, null);
begin
  if (select name from public.titles where id = v_season) is distinct from 'Severance Season 2'
     or (select name from public.titles where id = v_episode) is distinct from 'Severance S2E3' then
    raise exception 'FAIL 2: part labels are wrong';
  end if;
  if v_show in (v_season, v_episode) or v_season = v_episode then
    raise exception 'FAIL 2: the show and its parts share a row';
  end if;
  if public.ensure_title(990101, 'tv', 'Severance', 2022, null) <> v_show
     or public.ensure_tv_part(990101, 2, 3, 'Severance', 'Who Is Alive?', 2025, null) <> v_episode then
    raise exception 'FAIL 2: a repeat call made a new row';
  end if;
  raise notice 'PASS 2: show, season and episode are distinct rows, and repeat calls reuse them';
end $$;
reset role;

-- PASS 3: the table refuses duplicates and misshapen parts, even from the owner.
do $$
begin
  begin
    insert into public.titles (tmdb_id, media_type, name, season_number, episode_number)
    values (990101, 'tv', 'dupe', 2, 3);
    raise exception 'FAIL 3: a part was stored twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.titles (tmdb_id, media_type, name, season_number)
    values (880001, 'movie', 'Film Season 1', 1);
    raise exception 'FAIL 3: a film got a season';
  exception when check_violation then null;
  end;
  begin
    insert into public.titles (tmdb_id, media_type, name, episode_number)
    values (990101, 'tv', 'orphan', 4);
    raise exception 'FAIL 3: an episode was stored without a season';
  exception when check_violation then null;
  end;
  raise notice 'PASS 3: no duplicate parts, no film seasons, no orphan episodes';
end $$;

-- PASS 4: an episode is rated on its own, under the same RLS as any title.
set local role authenticated;
do $$
begin
  insert into public.global_ratings (user_id, title_id, scores)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, '{"story": 8}'
    from public.titles where tmdb_id = 990101 and season_number = 2 and episode_number = 3;
  insert into public.global_ratings (user_id, title_id, scores)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, '{"story": 6}'
    from public.titles where tmdb_id = 990101 and media_type = 'tv' and season_number is null;
  if (select count(*) from public.global_ratings
       where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'FAIL 4: the episode and the show did not get separate ratings';
  end if;
  raise notice 'PASS 4: an episode and its show carry separate solo ratings';
end $$;
reset role;

rollback;

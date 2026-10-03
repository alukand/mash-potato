-- Seasons and episodes, rated like any title.
--
-- A season or an episode is a ROW IN titles under its show's TMDB id, with
-- season_number (and, for an episode, episode_number) set. Everything keyed
-- on title_id then works on a part unchanged: solo ratings, group rounds and
-- their blind rule, discussion, tokens.
--
-- `name` holds the label the server composes ("Severance Season 2",
-- "Severance S2E3"), so every list that prints titles.name says which part
-- it means. `part_name` keeps TMDB's own name for the season or episode.
--
-- The show and its parts share (tmdb_id, media_type), so the old unique key
-- becomes a unique index over the part numbers too, and every lookup "by
-- TMDB id" must now say which part it wants (ensure_title below; the
-- client's findTitleId in lib/api.ts).

alter table public.titles
  add column season_number integer check (season_number between 0 and 999),
  add column episode_number integer check (episode_number between 0 and 9999),
  add column part_name text check (part_name is null or char_length(part_name) between 1 and 200);

-- A part belongs to a TMDB show, and an episode to a season.
alter table public.titles add constraint titles_part_shape check (
  (season_number is null and episode_number is null and part_name is null)
  or (media_type = 'tv' and tmdb_id is not null and season_number is not null)
);

alter table public.titles drop constraint titles_tmdb_id_media_type_key;
-- -1 stands for "not a part" (season 0 is TMDB's Specials). Manual titles
-- (tmdb_id null) still never collide: a null makes the whole key distinct.
create unique index titles_identity_key on public.titles
  (tmdb_id, media_type, coalesce(season_number, -1), coalesce(episode_number, -1));

-- ---- ensure_title: the film or show itself, never one of its parts ----------
-- Unchanged from 20260727120000 except that both lookups exclude parts (a
-- show's id would otherwise match its episodes too) and the conflict target
-- names the new index.
create or replace function public.ensure_title(
  p_tmdb_id integer,
  p_media_type text,
  p_name text,
  p_year integer,
  p_poster_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_poster text := nullif(btrim(coalesce(p_poster_path, '')), '');
  v_id     uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first';
  end if;
  perform public.consume_rate_limit('title_write', 60, 60);

  if p_media_type not in ('movie', 'tv') then
    raise exception 'a title is a film or a show';
  end if;
  if char_length(v_name) between 1 and 200 is not true then
    raise exception 'that title name is not usable';
  end if;
  -- Control characters would let a name break out of every line it renders on.
  if v_name ~ '[\x00-\x1F\x7F]' then
    raise exception 'that title name is not usable';
  end if;
  if p_year is not null and p_year not between 1870 and 2200 then
    raise exception 'that year is not usable';
  end if;
  -- A poster path is interpolated straight into an image.tmdb.org URL, so it
  -- has to look like one: no scheme, no host, no traversal.
  if v_poster is not null and v_poster !~ '^/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$' then
    raise exception 'that poster path is not usable';
  end if;

  if p_tmdb_id is not null then
    if p_tmdb_id <= 0 then
      raise exception 'that title id is not usable';
    end if;
    select id into v_id from public.titles
     where tmdb_id = p_tmdb_id and media_type = p_media_type::public.media_type
       and season_number is null;
    if v_id is not null then
      return v_id;
    end if;
  else
    -- Manual entry: the name is user-generated content, so hold it to the
    -- same standard as a posted comment.
    if exists (
      select 1 from public.banned_terms t
      where v_name ~* ('\m' || t.term || '\M')
    ) then
      raise exception 'that title contains language that is not allowed here';
    end if;
  end if;

  insert into public.titles (tmdb_id, media_type, name, year, poster_path)
  values (p_tmdb_id, p_media_type::public.media_type, v_name, p_year, v_poster)
  on conflict (tmdb_id, media_type, (coalesce(season_number, -1)), (coalesce(episode_number, -1)))
  do nothing
  returning id into v_id;

  if v_id is null then
    -- lost the race; the winner's row is the one everyone should use
    select id into v_id from public.titles
     where tmdb_id = p_tmdb_id and media_type = p_media_type::public.media_type
       and season_number is null;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_title(integer, text, text, integer, text) from public, anon;
grant execute on function public.ensure_title(integer, text, text, integer, text) to authenticated;

-- ---- ensure_tv_part: the only way to create a season or an episode ----------
-- Same trust model as ensure_title for TMDB titles: the ids came from our
-- own proxy, and the names are held to the same shape rules. p_episode null
-- means the whole season. Idempotent on (show, season, episode).
create function public.ensure_tv_part(
  p_tmdb_id integer,
  p_season integer,
  p_episode integer,
  p_show_name text,
  p_part_name text,
  p_year integer,
  p_poster_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_show   text := btrim(coalesce(p_show_name, ''));
  v_part   text := nullif(btrim(coalesce(p_part_name, '')), '');
  v_poster text := nullif(btrim(coalesce(p_poster_path, '')), '');
  v_name   text;
  v_id     uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first';
  end if;
  perform public.consume_rate_limit('title_write', 60, 60);

  if p_tmdb_id is null or p_tmdb_id <= 0 then
    raise exception 'that show id is not usable';
  end if;
  if p_season is null or p_season not between 0 and 999 then
    raise exception 'that season is not usable';
  end if;
  if p_episode is not null and p_episode not between 0 and 9999 then
    raise exception 'that episode is not usable';
  end if;
  if char_length(v_show) between 1 and 180 is not true or v_show ~ '[\x00-\x1F\x7F]' then
    raise exception 'that show name is not usable';
  end if;
  if v_part is not null and (char_length(v_part) > 200 or v_part ~ '[\x00-\x1F\x7F]') then
    raise exception 'that season or episode name is not usable';
  end if;
  if p_year is not null and p_year not between 1870 and 2200 then
    raise exception 'that year is not usable';
  end if;
  if v_poster is not null and v_poster !~ '^/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$' then
    raise exception 'that poster path is not usable';
  end if;

  -- The label every list prints. src/lib/titleParts.ts composes the same one.
  v_name := v_show || case
    when p_episode is not null then ' S' || p_season || 'E' || p_episode
    when p_season = 0 then ' Specials'
    else ' Season ' || p_season
  end;

  select id into v_id from public.titles
   where tmdb_id = p_tmdb_id and media_type = 'tv'
     and season_number = p_season
     and episode_number is not distinct from p_episode;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.titles
    (tmdb_id, media_type, name, year, poster_path, season_number, episode_number, part_name)
  values (p_tmdb_id, 'tv', v_name, p_year, v_poster, p_season, p_episode, v_part)
  on conflict (tmdb_id, media_type, (coalesce(season_number, -1)), (coalesce(episode_number, -1)))
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.titles
     where tmdb_id = p_tmdb_id and media_type = 'tv'
       and season_number = p_season
       and episode_number is not distinct from p_episode;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_tv_part(integer, integer, integer, text, text, integer, text) from public, anon;
grant execute on function public.ensure_tv_part(integer, integer, integer, text, text, integer, text) to authenticated;

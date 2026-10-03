-- Seasons and episodes, kept out of the way of the apps that came before them.
--
-- 20261001180000 filed a season or an episode under its show's TMDB id, so a
-- show and its parts shared (tmdb_id, media_type). Every app from before 1.1
-- (1.0 on the App Store, and the web app until it redeploys) looks a title up
-- by exactly that pair and expects ONE row (.maybeSingle()): the moment
-- anyone rated an episode, those apps would have failed on the show's page.
--
-- So a part carries NO tmdb_id. The show's id moves to show_tmdb_id, and:
--   * a lookup by (tmdb_id, media_type) finds the film or the show alone
--     again, so the original unique constraint comes back;
--   * an older app that meets a part (a round on an episode, say) sees a
--     title with no TMDB identity, which it already treats as a typed-in title;
--   * parts get their own unique key, on (show, season, episode).
-- Nothing from 20261001180000 is hosted before this ships with it, so the
-- update below only reshapes development databases.

alter table public.titles
  add column show_tmdb_id integer check (show_tmdb_id is null or show_tmdb_id > 0);

alter table public.titles drop constraint titles_part_shape;
update public.titles set show_tmdb_id = tmdb_id, tmdb_id = null
 where season_number is not null;
alter table public.titles add constraint titles_part_shape check (
  (season_number is null and episode_number is null and part_name is null and show_tmdb_id is null)
  or (media_type = 'tv' and tmdb_id is null and show_tmdb_id is not null and season_number is not null)
);

drop index public.titles_identity_key;
alter table public.titles
  add constraint titles_tmdb_id_media_type_key unique (tmdb_id, media_type);
create unique index titles_part_key on public.titles
  (show_tmdb_id, season_number, (coalesce(episode_number, -1)))
  where show_tmdb_id is not null;

-- ---- ensure_title: back on the original constraint ----------------------------
-- As 20261001180000 left it, but a part can no longer match a TMDB id, so the
-- lookups need no part filter and the conflict target is the restored pair.
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
     where tmdb_id = p_tmdb_id and media_type = p_media_type::public.media_type;
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
  on conflict (tmdb_id, media_type) do nothing
  returning id into v_id;

  if v_id is null then
    -- lost the race; the winner's row is the one everyone should use
    select id into v_id from public.titles
     where tmdb_id = p_tmdb_id and media_type = p_media_type::public.media_type;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_title(integer, text, text, integer, text) from public, anon;
grant execute on function public.ensure_title(integer, text, text, integer, text) to authenticated;

-- ---- ensure_tv_part: a part under show_tmdb_id ------------------------------------
-- As 20261001180000 left it, but the show's id goes in show_tmdb_id and the
-- part's own tmdb_id stays null.
create or replace function public.ensure_tv_part(
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
   where show_tmdb_id = p_tmdb_id
     and season_number = p_season
     and episode_number is not distinct from p_episode;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.titles
    (show_tmdb_id, media_type, name, year, poster_path, season_number, episode_number, part_name)
  values (p_tmdb_id, 'tv', v_name, p_year, v_poster, p_season, p_episode, v_part)
  on conflict (show_tmdb_id, season_number, (coalesce(episode_number, -1)))
    where show_tmdb_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.titles
     where show_tmdb_id = p_tmdb_id
       and season_number = p_season
       and episode_number is not distinct from p_episode;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ensure_tv_part(integer, integer, integer, text, text, integer, text) from public, anon;
grant execute on function public.ensure_tv_part(integer, integer, integer, text, text, integer, text) to authenticated;

-- ---- following_feed: a part still names its show --------------------------------
-- Unchanged from 20261002140000 but for the TMDB id it returns: a part's is
-- its show's, so the app can open the show and go straight to the part.
create or replace function public.following_feed(p_limit integer default 30, p_user_id uuid default null)
returns table(
  user_id uuid, display_name text, avatar_key text, taste_mode text,
  title_id uuid, tmdb_id integer, media_type text,
  season_number integer, episode_number integer,
  title_name text, year integer, poster_path text,
  scores jsonb, rated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_key, p.taste_mode,
         t.id, coalesce(t.tmdb_id, t.show_tmdb_id), t.media_type::text,
         t.season_number, t.episode_number,
         t.name, t.year, t.poster_path,
         g.scores, g.updated_at
    from public.follows f
    join public.profiles p on p.id = f.followee_id and p.share_ratings and not p.banned
    join public.global_ratings g on g.user_id = f.followee_id
    join public.titles t on t.id = g.title_id
   where f.follower_id = (select auth.uid())
     and (p_user_id is null or f.followee_id = p_user_id)
     and not exists (
       select 1 from public.user_blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = f.followee_id)
           or (b.blocker_id = f.followee_id and b.blocked_id = (select auth.uid())))
   order by g.updated_at desc, g.title_id
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.following_feed(integer, uuid) from public, anon;
grant execute on function public.following_feed(integer, uuid) to authenticated;

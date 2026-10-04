-- Genre rubrics: every genre starts from a standard rubric, and anyone can
-- make their own for a genre, used in their solo ratings and in every group
-- they are in. A group's round blends its members' rubrics for the round's
-- genre and freezes the result in its snapshot, exactly as before.
--
-- DESIGN.md "Rubric cadence" keeps its law: weights are settled ahead of
-- time (per genre now, not just per group), a round freezes its rubric when
-- it starts, and nobody ever edits weights for one movie. What a genre's
-- standard adds lives in src/lib/genres.ts; the database only stores what
-- people chose.
--
-- Which genre leads a title is a rule: 'first' (the first genre TMDB lists,
-- the default) or 'order' (the app's fixed genre order). Each person picks
-- one for their solo ratings, and each group's owner picks one for its rounds.

-- ---- your genre rubrics -----------------------------------------------------------

-- One row per person per genre they have DECIDED on. rows null means "I chose
-- the standard" (so they are not asked again); a missing row means they have
-- not been asked yet. The genre list must match src/lib/genres.ts.
create table public.genre_rubrics (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  genre      text not null check (genre in (
    'action', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'family',
    'fantasySciFi', 'history', 'horror', 'music', 'mysteryThriller', 'romance',
    'unscripted', 'war', 'western')),
  rows       jsonb check (
    rows is null
    or (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 30)),
  updated_at timestamptz not null default now(),
  primary key (user_id, genre)
);

alter table public.genre_rubrics enable row level security;

-- Your own, and your groupmates': a round blends everyone's rubric for its
-- genre, so the person starting it has to be able to read them (as with
-- member_rubrics). Strangers read nothing.
create policy genre_rubrics_select on public.genre_rubrics
  for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_group_with(user_id));
create policy genre_rubrics_insert_self on public.genre_rubrics
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy genre_rubrics_update_self on public.genre_rubrics
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy genre_rubrics_delete_self on public.genre_rubrics
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.genre_rubrics from public, anon;
grant select, insert, update, delete on public.genre_rubrics to authenticated;

create trigger genre_rubrics_touch_updated_at
  before update on public.genre_rubrics
  for each row execute function public.touch_updated_at();

-- ---- which genre leads ------------------------------------------------------------

alter table public.profiles
  add column genre_rule text not null default 'first'
    check (genre_rule in ('first', 'order'));
-- Column grants, like taste_mode: readable, and writable by its owner (RLS
-- profiles_update_self keeps it to your own row).
grant select (genre_rule) on public.profiles to authenticated;
grant update (genre_rule) on public.profiles to authenticated;

-- The group's rule for its rounds; the owner changes it (groups_update_owner).
alter table public.groups
  add column genre_rule text not null default 'first'
    check (genre_rule in ('first', 'order'));

-- ---- what a round and a rating were scored as ---------------------------------------

-- The genre a round was scored as ("Scored as Horror"), written by the app
-- that starts it, beside the rubric snapshot it already writes. Null: a
-- round from before genre rubrics, or a title with no genre.
alter table public.reveal_sessions
  add column genre text check (genre is null or genre in (
    'action', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'family',
    'fantasySciFi', 'history', 'horror', 'music', 'mysteryThriller', 'romance',
    'unscripted', 'war', 'western'));

-- A solo rating keeps the rubric it was given with, as a round keeps its
-- snapshot, so the number a follower sees is the number its rater sees.
-- Null on ratings from before this (they read on their mode's card).
alter table public.global_ratings
  add column genre text check (genre is null or genre in (
    'action', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'family',
    'fantasySciFi', 'history', 'horror', 'music', 'mysteryThriller', 'romance',
    'unscripted', 'war', 'western')),
  add column rubric jsonb check (
    rubric is null
    or (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 1 and 30));

-- ---- following_feed: the rating's own rubric travels with it ------------------------
-- Unchanged from 20261003130000 but for the rubric column, so the follower's
-- app computes the rater's number on the rater's own card. The return type
-- grows, hence drop + create.
drop function public.following_feed(integer, uuid);
create function public.following_feed(p_limit integer default 30, p_user_id uuid default null)
returns table(
  user_id uuid, display_name text, avatar_key text, taste_mode text,
  title_id uuid, tmdb_id integer, media_type text,
  season_number integer, episode_number integer,
  title_name text, year integer, poster_path text,
  scores jsonb, rated_at timestamptz, rubric jsonb
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_key, p.taste_mode,
         t.id, coalesce(t.tmdb_id, t.show_tmdb_id), t.media_type::text,
         t.season_number, t.episode_number,
         t.name, t.year, t.poster_path,
         g.scores, g.updated_at, g.rubric
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

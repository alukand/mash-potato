-- Follows, opt-in rating sharing, and the feed of ratings from people you follow.
--
-- The privacy model (20260713150000) said solo ratings stay private, always,
-- and that taste is never shared automatically. That still holds by DEFAULT:
-- a person's solo ratings reach anyone only after they turn on
-- profiles.share_ratings, and then only the people who follow them, through
-- one definer RPC (following_feed) that builds exactly what is shown.
--
--   * Following is one-way and needs no approval, because it reveals nothing
--     on its own: it only means "show me what they choose to share".
--   * Who follows whom is private. You see your own counts and who you
--     follow; no one sees anyone else's lists or counts. No leaderboards.
--   * Only SOLO ratings (global_ratings) are shared. A group's blind cards
--     never are: THE ONE RULE is untouched, since the feed never reads
--     member_scores at all.
--   * Blocks cut both ways, and a banned account neither follows nor appears.

alter table public.profiles
  add column share_ratings boolean not null default false;
-- Like is_moderator, the column is excluded by omission from the column
-- grants on profiles (20260727120000): it is read and set through the RPCs below.

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;

-- ---- following -------------------------------------------------------------------
create function public.follow_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'you cannot follow yourself'; end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then
    raise exception 'following is unavailable';
  end if;
  perform public.consume_rate_limit('follow', 60, 3600);
  -- One message for "gone", "banned" and "blocked", so it reveals nothing.
  if not exists (select 1 from public.profiles where id = p_user_id and not banned)
     or exists (select 1 from public.user_blocks b
                 where (b.blocker_id = v_uid and b.blocked_id = p_user_id)
                    or (b.blocker_id = p_user_id and b.blocked_id = v_uid)) then
    raise exception 'you cannot follow this person';
  end if;
  insert into public.follows (follower_id, followee_id) values (v_uid, p_user_id)
  on conflict do nothing;
end;
$$;
revoke all on function public.follow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;

create function public.unfollow_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from public.follows where follower_id = auth.uid() and followee_id = p_user_id;
end;
$$;
revoke all on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated;

-- Whether you follow them, and whether they share (so their page can say
-- what following will show you). Nothing about anyone else's follows.
create function public.follow_state(p_user_id uuid)
returns table(following boolean, shares_ratings boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.follows f
             where f.follower_id = (select auth.uid()) and f.followee_id = p_user_id),
    coalesce((select p.share_ratings and not p.banned from public.profiles p where p.id = p_user_id), false)
  where (select auth.uid()) is not null;
$$;
revoke all on function public.follow_state(uuid) from public, anon;
grant execute on function public.follow_state(uuid) to authenticated;

-- ---- your own side ----------------------------------------------------------------
create function public.my_follow_summary()
returns table(followers bigint, following bigint, share_ratings boolean)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.follows f where f.followee_id = (select auth.uid())),
    (select count(*) from public.follows f where f.follower_id = (select auth.uid())),
    coalesce((select p.share_ratings from public.profiles p where p.id = (select auth.uid())), false)
  where (select auth.uid()) is not null;
$$;
revoke all on function public.my_follow_summary() from public, anon;
grant execute on function public.my_follow_summary() to authenticated;

create function public.my_following()
returns table(user_id uuid, display_name text, avatar_key text, shares_ratings boolean, followed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_key, p.share_ratings, f.created_at
    from public.follows f join public.profiles p on p.id = f.followee_id
   where f.follower_id = (select auth.uid()) and not p.banned
   order by f.created_at desc;
$$;
revoke all on function public.my_following() from public, anon;
grant execute on function public.my_following() to authenticated;

create function public.set_share_ratings(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_on is null then raise exception 'choose whether to share your ratings'; end if;
  update public.profiles set share_ratings = p_on where id = auth.uid();
end;
$$;
revoke all on function public.set_share_ratings(boolean) from public, anon;
grant execute on function public.set_share_ratings(boolean) to authenticated;

-- ---- the feed ---------------------------------------------------------------------
-- Solo ratings from people you follow who share them, newest first. With
-- p_user_id, just that one person (their page). Returns the category scores
-- and the rater's taste mode so the app computes the number with the same
-- tested math as everywhere else (lib/scoring.ts), never a second copy here.
create function public.following_feed(p_limit integer default 30, p_user_id uuid default null)
returns table(
  user_id uuid, display_name text, avatar_key text, taste_mode text,
  title_id uuid, tmdb_id integer, media_type text,
  season_number integer, episode_number integer,
  title_name text, year integer, poster_path text,
  scores jsonb, rated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_key, p.taste_mode,
         t.id, t.tmdb_id, t.media_type::text,
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

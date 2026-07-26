-- Launch hardening: close the three open write/read surfaces and put a
-- ceiling on the abusable ones. Found by auditing the HOSTED project against
-- the architecture the rest of the app already follows ("SELECT-only policies,
-- every write through a constrained definer RPC").
--
-- 1. public.titles accepted INSERTs from any signed-in user with
--    `with check (true)` — arbitrary `name` and `poster_path`, and titles are
--    globally readable and surface inside other people's groups, playlists and
--    polls. That is a user-generated-content injection path, which is exactly
--    what App Store guideline 1.2 polices.
-- 2. public.titles had INSERT *and UPDATE* granted to `authenticated` on every
--    column. UPDATE was inert only because no UPDATE policy existed: the grant
--    already said yes and nothing but an absence said no. That is the shape
--    the GRANTS LAW exists to prevent.
-- 3. public.profiles is readable row-wide by every signed-in user, which is
--    correct for display_name/avatar_key (five PostgREST embeds depend on it:
--    message senders, comment authors, member lists, playlist owners, friends)
--    but leaks `banned` — moderation state, an oracle for who has been
--    sanctioned — and `created_at`.
--
-- Plus: nothing anywhere put a ceiling on write volume. One account could
-- flood messages, DM requests, comments, polls or titles as fast as the
-- network allowed.

-- ---- rate limiting ---------------------------------------------------------
--
-- A fixed window per (user, bucket). Fixed beats sliding here: one row per
-- user per bucket per window, an upsert to bump it, and expiry is a range
-- delete. A sliding log would store a row per REQUEST on the hottest paths in
-- the product, which is the same reason typing indicators are not a table.

create table public.rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.rate_limits enable row level security;
-- Definer-only, like banned_terms: a client that could read this could measure
-- other people's activity. RLS with no policies already yields zero rows, but
-- the grant must go too — Supabase's default privileges hand new public tables
-- to anon/authenticated, and those defaults differ between a local `db reset`
-- and a hosted `db push` (learned 2026-07-25, migration 20260725120000). Never
-- leave "no policy" as the only thing standing in the way.
revoke all on public.rate_limits from public, anon, authenticated;

/**
 * Count one hit against a bucket; raise when the window is already full.
 *
 * Callers pass their own limit so the numbers live next to the operation
 * being limited rather than in a config table nobody reads. Limits are set
 * generously — they exist to stop scripts, not to shape normal use.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_start  timestamptz;
  v_hits   integer;
begin
  if v_uid is null then
    raise exception 'sign in first';
  end if;

  -- Floor now() to the window, so every caller in the same window shares a row.
  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start)
    do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  if v_hits > p_limit then
    raise exception 'you are doing that too fast, give it a moment';
  end if;

  -- Opportunistic cleanup: ~1 call in 100 sweeps this user's stale windows, so
  -- the table stays small without a cron job.
  if v_hits % 100 = 0 then
    delete from public.rate_limits
     where user_id = v_uid and window_start < clock_timestamp() - interval '1 day';
  end if;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
-- authenticated: the edge proxy calls it with the caller's JWT, and the write
-- RPCs below call it as themselves.
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- ---- titles: writes move behind a definer RPC -------------------------------

drop policy if exists titles_insert_authenticated on public.titles;
revoke insert, update on public.titles from authenticated;
-- SELECT stays: a title is shared reference data, and every group needs to
-- read the rows other groups created.

/**
 * The only way to create a title.
 *
 * TMDB-backed rows are safe by construction (the id came from our own proxy),
 * so the interesting case is a MANUAL title — free text a member typed, which
 * then becomes globally readable. Those go through the same wordlist that
 * gates comments, because a title is no less visible than a comment.
 *
 * Idempotent on (tmdb_id, media_type): concurrent callers racing to add the
 * same film get the same row instead of a unique violation the client has to
 * catch and re-query.
 */
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

-- ---- profiles: stop leaking moderation state --------------------------------
--
-- The row policy stays permissive, because five PostgREST embeds depend on it
-- (message senders, comment authors, member lists, playlist owners, friends) —
-- but `banned` is moderation state and an oracle for who has been sanctioned,
-- and `created_at` is nobody's business either.
--
-- The order matters and is easy to get wrong: a COLUMN-level revoke does
-- nothing while a TABLE-level SELECT grant is in place, because the table
-- grant already covers every column. Drop the table grant, then re-grant the
-- columns that stay. (Verified: revoking the columns alone left `banned`
-- readable.) `banned` is read inside definer RPCs, which run as owner and are
-- unaffected by what `authenticated` may select.

revoke select on public.profiles from authenticated, anon;
grant select (id, display_name, avatar_key, taste_mode, accepted_terms_at)
  on public.profiles to authenticated;

-- ---- ceilings on the abusable writes ----------------------------------------
--
-- Enforced by BEFORE INSERT triggers rather than by re-issuing send_message /
-- post_comment / start_dm with one extra line each. Two reasons: a trigger
-- cannot drift from an RPC body it does not live in (re-issuing ~80 lines to
-- add one is how a subtle edit gets lost), and it holds whatever future path
-- writes the row.
--
-- Limits are per user and deliberately loose — they stop a script, not a
-- talkative group.

create or replace function public.rate_limit_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('message_send', 60, 60);
  return new;
end;
$$;

create or replace function public.rate_limit_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('comment_post', 20, 60);
  return new;
end;
$$;

create or replace function public.rate_limit_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('dm_start', 20, 3600);
  return new;
end;
$$;

-- 'system' messages are roster notices the app writes on your behalf (someone
-- left a chat). Counting those could make leaving a chat fail, so the ceiling
-- covers what a person actually types.
create trigger on_message_rate_limit
  before insert on public.messages
  for each row when (new.kind <> 'system')
  execute function public.rate_limit_message();

create trigger on_comment_rate_limit
  before insert on public.title_comments
  for each row execute function public.rate_limit_comment();

-- Only DMs: a group's chat is created by a trigger when the group is created,
-- and blocking THAT would block making a group.
create trigger on_dm_rate_limit
  before insert on public.conversations
  for each row when (new.kind = 'dm')
  execute function public.rate_limit_dm();

-- Trigger internals: sealed from every client role (note that revoking from
-- `public` alone does NOT cover `authenticated`).
revoke all on function public.rate_limit_message() from public, anon, authenticated;
revoke all on function public.rate_limit_comment() from public, anon, authenticated;
revoke all on function public.rate_limit_dm() from public, anon, authenticated;

-- Mash Potato tokens: a private, capped, quality-weighted loyalty ledger.
--
-- What earns (amounts and caps live in token_rules, tunable in SQL):
--   daily_claim    tap once per local day
--   rating_group   your locked card in a revealed round with 2+ locked cards
--   rating_solo    your first solo rating of a film
--   take           a public take on a film (any length)
--   take_bonus     a take of 300+ substantial characters, PENDING for 48h; it
--                  never matures if the take is deleted, hidden or removed first
--   take_reaction  the first time someone else reacts to your take
--
-- The laws (CLAUDE.md "REWARDS", DESIGN.md "Reward loop law"):
--   * SERVER-AUTHORITATIVE. No client role can touch these tables. Awards come
--     from triggers on the activity itself; the only client action is the
--     daily claim. award_tokens() is the single writer of earned tokens.
--   * ONCE PER FILM: one rating award and one take award per person per film,
--     enforced by unique indexes, so delete-and-redo never pays twice. A movie
--     night after a solo rating tops the film up to the movie-night amount.
--   * CAPPED per local day, and quality-weighted: group movie nights earn the
--     most; the long-take bonus needs real words and 48 quiet hours.
--   * PRIVATE. Balances are read only by their owner (my_rewards). No
--     leaderboards, no public counts, no streaks, no reminders.
--   * START FRESH. When the `rewards` flag first turns on, every (user, film)
--     already rated or reviewed is recorded in token_ineligible and never pays.
--   * FAILS CLOSED on feature_flags.rewards: off means nothing earns.
--   * Tokens cannot be bought or transferred, and never reward App Store
--     ratings or reviews (guideline 3.2.2); takes review FILMS.

-- ---- the switch: off until launch ---------------------------------------------

insert into public.feature_flags (key, enabled)
values ('rewards', false)
on conflict (key) do nothing;

-- ---- tables -------------------------------------------------------------------

create table public.token_rules (
  key       text primary key check (key in (
              'daily_claim', 'rating_group', 'rating_solo',
              'take', 'take_bonus', 'take_reaction')),
  tokens    integer not null check (tokens between 0 and 1000),
  daily_cap integer check (daily_cap is null or daily_cap between 0 and 1000),
  settings  jsonb not null default '{}'::jsonb
);

insert into public.token_rules (key, tokens, daily_cap, settings) values
  ('daily_claim',   1, null, '{}'),
  ('rating_group',  3, 5,    '{"min_locked_cards": 2}'),
  ('rating_solo',   1, 5,    '{}'),
  ('take',          3, 3,    '{}'),
  ('take_bonus',    2, null, '{"min_chars": 300, "min_words": 45, "min_distinct_words": 25,
                               "min_letter_share": 0.6, "max_char_run": 8, "hold_hours": 48}'),
  ('take_reaction', 1, null, '{}');

-- One row: when the program started (stamped by the flag, below).
create table public.token_program (
  singleton  boolean primary key default true check (singleton),
  started_at timestamptz
);
insert into public.token_program (singleton) values (true);

-- Per account: the time zone that defines "today" for the daily token and
-- the caps. Set by the first claim; changeable once every 30 days, so hopping
-- zones cannot buy a second daily token.
create table public.token_accounts (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  tz            text not null default 'UTC',
  tz_changed_at timestamptz,
  created_at    timestamptz not null default now()
);

create table public.token_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in (
                'daily_claim', 'rating_solo', 'rating_group',
                'take', 'take_bonus', 'take_reaction',
                'take_reconcile', 'adjustment')),
  amount      integer not null check (amount <> 0),
  -- pending counts once matures_at has passed; void never counts
  status      text not null default 'available'
                check (status in ('available', 'pending', 'void')),
  matures_at  timestamptz,
  title_id    uuid references public.titles (id) on delete set null,
  session_id  uuid references public.reveal_sessions (id) on delete set null,
  comment_id  uuid references public.title_comments (id) on delete set null,
  earned_on   date not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint token_ledger_pending_needs_maturity
    check (status <> 'pending' or matures_at is not null)
);

-- Idempotency IS the rules: each of these is "earns once".
create unique index token_ledger_daily_once
  on public.token_ledger (user_id, earned_on) where kind = 'daily_claim';
create unique index token_ledger_rating_once
  on public.token_ledger (user_id, title_id, kind) where kind in ('rating_solo', 'rating_group');
create unique index token_ledger_take_once
  on public.token_ledger (user_id, title_id) where kind = 'take';
create unique index token_ledger_comment_once
  on public.token_ledger (comment_id, kind) where kind in ('take_bonus', 'take_reaction');
create index token_ledger_user_recent on public.token_ledger (user_id, id desc);
create index token_ledger_user_day on public.token_ledger (user_id, kind, earned_on);
create index token_ledger_comment on public.token_ledger (comment_id) where comment_id is not null;

-- Start fresh: films rated or reviewed before the program began never pay.
create table public.token_ineligible (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  kind     text not null check (kind in ('rating', 'take')),
  primary key (user_id, title_id, kind)
);

alter table public.token_rules      enable row level security;
alter table public.token_program    enable row level security;
alter table public.token_accounts   enable row level security;
alter table public.token_ledger     enable row level security;
alter table public.token_ineligible enable row level security;

-- No client role touches any of them. Reads are my_rewards(); writes are the
-- definer functions below. (No policies: RLS with zero grants is the wall.)
revoke all on public.token_rules, public.token_program, public.token_accounts,
              public.token_ledger, public.token_ineligible
  from public, anon, authenticated;

-- ---- internals (trigger-only) -------------------------------------------------

create or replace function public.rewards_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = 'rewards'), false)
     and coalesce((select started_at is not null from public.token_program), false);
$$;

-- "Today" for a user: their stored zone, UTC until they first claim.
create or replace function public.reward_day(p_user uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
    (select tz from public.token_accounts where user_id = p_user), 'UTC'))::date;
$$;

-- THE single writer of earned tokens. Returns what it credited (0 for
-- nothing). Order matters: the switch, then the person, then the film, then
-- the cap, then the once-only index (on conflict do nothing).
create or replace function public.award_tokens(
  p_user       uuid,
  p_kind       text,
  p_amount     integer,
  p_title      uuid default null,
  p_session    uuid default null,
  p_comment    uuid default null,
  p_status     text default 'available',
  p_matures_at timestamptz default null,
  p_detail     jsonb default '{}'::jsonb
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_day   date;
  v_cap   integer;
  v_count integer;
  v_id    bigint;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  if not public.rewards_on() then return 0; end if;
  if coalesce((select banned from public.profiles where id = p_user), true) then return 0; end if;
  if p_title is not null and p_kind in ('rating_solo', 'rating_group', 'take') and exists (
    select 1 from public.token_ineligible i
     where i.user_id = p_user and i.title_id = p_title
       and i.kind = case when p_kind = 'take' then 'take' else 'rating' end
  ) then
    return 0;
  end if;

  v_day := public.reward_day(p_user);
  select daily_cap into v_cap from public.token_rules where key = p_kind;
  if v_cap is not null then
    -- serialize this user's awards of this kind, so the cap holds under races
    perform pg_advisory_xact_lock(hashtext('mp-token-cap:' || p_user::text || ':' || p_kind));
    select count(*) into v_count from public.token_ledger
     where user_id = p_user and kind = p_kind and earned_on = v_day;
    if v_count >= v_cap then return 0; end if;
  end if;

  insert into public.token_ledger
    (user_id, kind, amount, status, matures_at, title_id, session_id, comment_id, earned_on, detail)
  values
    (p_user, p_kind, p_amount, p_status, p_matures_at, p_title, p_session, p_comment, v_day,
     coalesce(p_detail, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;
  return case when v_id is null then 0 else p_amount end;
end;
$$;

-- One rating award per film. A movie night after a solo rating tops up to the
-- movie-night amount; a solo rating after a movie night earns nothing.
create or replace function public.award_rating(
  p_user uuid, p_title uuid, p_kind text, p_session uuid default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_solo_paid integer;
begin
  if p_kind = 'rating_solo' then
    if exists (select 1 from public.token_ledger
                where user_id = p_user and title_id = p_title and kind = 'rating_group') then
      return 0;
    end if;
    return public.award_tokens(p_user, 'rating_solo',
      (select tokens from public.token_rules where key = 'rating_solo'), p_title);
  end if;
  select coalesce(sum(amount), 0) into v_solo_paid from public.token_ledger
   where user_id = p_user and title_id = p_title and kind = 'rating_solo';
  return public.award_tokens(p_user, 'rating_group',
    (select tokens from public.token_rules where key = 'rating_group') - v_solo_paid,
    p_title, p_session);
end;
$$;

-- A movie night pays every locked card, once the round is revealed and has
-- enough of them that it was a night with other people (a one-person "group"
-- would otherwise triple the solo rate). Safe to call repeatedly.
create or replace function public.award_movie_night(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_title uuid;
  v_state public.reveal_state;
  v_min   integer;
  r       record;
begin
  select title_id, state into v_title, v_state from public.reveal_sessions where id = p_session;
  if v_state is distinct from 'revealed' then return; end if;
  select coalesce((settings ->> 'min_locked_cards')::integer, 2) into v_min
    from public.token_rules where key = 'rating_group';
  if (select count(*) from public.member_scores where session_id = p_session and locked)
       < v_min then
    return;
  end if;
  for r in select member_id from public.member_scores where session_id = p_session and locked loop
    perform public.award_rating(r.member_id, v_title, 'rating_group', p_session);
  end loop;
end;
$$;

-- The long-take bonus is for writing, not typing: enough characters, enough
-- distinct words, mostly letters, no held-down keys. (Duplicates are checked
-- separately, against the author's other takes.)
create or replace function public.take_is_substantial(p_body text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  s        jsonb := coalesce((select settings from public.token_rules where key = 'take_bonus'), '{}'::jsonb);
  v        text := btrim(coalesce(p_body, ''));
  v_words  text[];
  v_spaced integer;
  v_alpha  integer;
begin
  if char_length(v) < coalesce((s ->> 'min_chars')::integer, 300) then return false; end if;
  v_words := array(
    select w from regexp_split_to_table(lower(v), '[^[:alpha:]'']+') as w where w <> '');
  if coalesce(array_length(v_words, 1), 0) < coalesce((s ->> 'min_words')::integer, 45) then
    return false;
  end if;
  if (select count(distinct w) from unnest(v_words) as w)
       < coalesce((s ->> 'min_distinct_words')::integer, 25) then
    return false;
  end if;
  v_spaced := char_length(regexp_replace(v, '\s', '', 'g'));
  v_alpha := char_length(regexp_replace(v, '[^[:alpha:]]', '', 'g'));
  if v_spaced = 0
     or v_alpha::numeric / v_spaced < coalesce((s ->> 'min_letter_share')::numeric, 0.6) then
    return false;
  end if;
  if v ~ ('(.)\1{' || coalesce((s ->> 'max_char_run')::integer, 8) || ',}') then
    return false;
  end if;
  return true;
end;
$$;

-- The same words in the same order, ignoring case and punctuation.
create or replace function public.take_digest(p_body text)
returns text language sql immutable security definer set search_path = '' as $$
  select md5(array_to_string(array(
    select w from regexp_split_to_table(lower(coalesce(p_body, '')), '[^[:alpha:]'']+') as w
     where w <> ''), ' '));
$$;

-- Bring a take's AVAILABLE tokens to what it should be worth now: nothing
-- while it is hidden or removed, what it earned while it is up. A pending
-- bonus that has not matured is voided for good if the take is deleted,
-- hidden or removed. (Deleting your own take keeps what it earned.)
create or replace function public.reconcile_take(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c        record;
  v_target integer;
  v_net    integer;
begin
  select id, author_id, title_id, deleted, auto_hidden, removed into c
    from public.title_comments where id = p_comment;
  if c.id is null then return; end if;
  if not exists (select 1 from public.token_ledger where comment_id = p_comment and kind = 'take') then
    return;
  end if;

  if c.deleted or c.auto_hidden or c.removed then
    update public.token_ledger set status = 'void'
     where comment_id = p_comment and kind = 'take_bonus'
       and status = 'pending' and matures_at > now();
  end if;

  select coalesce(sum(amount), 0) into v_target from public.token_ledger
   where comment_id = p_comment and kind in ('take', 'take_bonus', 'take_reaction')
     and (status = 'available' or (status = 'pending' and matures_at <= now()));
  if c.auto_hidden or c.removed then v_target := 0; end if;

  select coalesce(sum(amount), 0) into v_net from public.token_ledger
   where comment_id = p_comment
     and kind in ('take', 'take_bonus', 'take_reaction', 'take_reconcile')
     and (status = 'available' or (status = 'pending' and matures_at <= now()));

  if v_net <> v_target then
    insert into public.token_ledger (user_id, kind, amount, title_id, comment_id, earned_on, detail)
    values (c.author_id, 'take_reconcile', v_target - v_net, c.title_id, p_comment,
            public.reward_day(c.author_id),
            jsonb_build_object('reason', case when v_target > v_net then 'restored' else 'hidden' end));
  end if;
end;
$$;

-- ---- triggers -------------------------------------------------------------------

create or replace function public.reward_solo_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.award_rating(new.user_id, new.title_id, 'rating_solo');
  return null;
end;
$$;
create trigger global_ratings_reward
  after insert on public.global_ratings
  for each row execute function public.reward_solo_rating();

create or replace function public.reward_session_revealed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'revealed' and old.state is distinct from 'revealed' then
    perform public.award_movie_night(new.id);
  end if;
  return null;
end;
$$;
create trigger reveal_sessions_reward
  after update of state on public.reveal_sessions
  for each row execute function public.reward_session_revealed();

-- Late scoring: a card locked after the reveal still counts for the night.
create or replace function public.reward_locked_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.locked and (tg_op = 'INSERT' or not old.locked) then
    perform public.award_movie_night(new.session_id);
  end if;
  return null;
end;
$$;
create trigger member_scores_reward
  after insert or update of locked on public.member_scores
  for each row execute function public.reward_locked_card();

-- Public takes only: top-level, no group. Group threads are conversation.
create or replace function public.reward_take()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
begin
  if new.group_id is not null or new.parent_id is not null or new.deleted then
    return null;
  end if;
  if public.award_tokens(new.author_id, 'take',
       (select tokens from public.token_rules where key = 'take'),
       new.title_id, null, new.id, 'available', null,
       jsonb_build_object('digest', public.take_digest(new.body))) = 0 then
    return null;  -- no base award (cap, already paid for this film, off, ...) means no bonus
  end if;
  if public.take_is_substantial(new.body) and not exists (
    select 1 from public.title_comments o
     where o.author_id = new.author_id and o.id <> new.id
       and o.group_id is null and o.parent_id is null
       and public.take_digest(o.body) = public.take_digest(new.body)
  ) then
    select settings into s from public.token_rules where key = 'take_bonus';
    perform public.award_tokens(new.author_id, 'take_bonus',
      (select tokens from public.token_rules where key = 'take_bonus'),
      new.title_id, null, new.id, 'pending',
      now() + make_interval(hours => coalesce((s ->> 'hold_hours')::integer, 48)));
  end if;
  return null;
end;
$$;
create trigger title_comments_reward
  after insert on public.title_comments
  for each row execute function public.reward_take();

create or replace function public.reward_take_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.deleted, new.auto_hidden, new.removed)
       is distinct from (old.deleted, old.auto_hidden, old.removed) then
    perform public.reconcile_take(new.id);
  end if;
  return null;
end;
$$;
create trigger title_comments_reward_reconcile
  after update of deleted, auto_hidden, removed on public.title_comments
  for each row execute function public.reward_take_changed();

create or replace function public.reward_take_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select author_id, title_id, group_id, parent_id, deleted, auto_hidden, removed into c
    from public.title_comments where id = new.comment_id;
  if c.author_id is null or c.author_id = new.user_id then return null; end if;
  if c.group_id is not null or c.parent_id is not null
     or c.deleted or c.auto_hidden or c.removed then
    return null;
  end if;
  if not exists (select 1 from public.token_ledger
                  where comment_id = new.comment_id and kind = 'take') then
    return null;
  end if;
  perform public.award_tokens(c.author_id, 'take_reaction',
    (select tokens from public.token_rules where key = 'take_reaction'),
    c.title_id, null, new.comment_id);
  return null;
end;
$$;
create trigger comment_reactions_reward
  after insert on public.comment_reactions
  for each row execute function public.reward_take_reaction();

-- Start fresh: the first time `rewards` turns on, stamp the start and record
-- every film already rated or reviewed, so none of them ever pays.
create or replace function public.start_token_program()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.key <> 'rewards' or not new.enabled then return null; end if;
  if tg_op = 'UPDATE' then
    if old.enabled then return null; end if;  -- (OLD is unassigned on INSERT)
  end if;
  if (select started_at from public.token_program) is not null then return null; end if;

  insert into public.token_ineligible (user_id, title_id, kind)
    select user_id, title_id, 'rating' from public.global_ratings
    union
    select ms.member_id, rs.title_id, 'rating'
      from public.member_scores ms
      join public.reveal_sessions rs on rs.id = ms.session_id
     where ms.locked
    union
    select author_id, title_id, 'take' from public.title_comments
     where group_id is null and parent_id is null
  on conflict do nothing;
  update public.token_program set started_at = now();
  return null;
end;
$$;
create trigger feature_flags_start_tokens
  after insert or update of enabled on public.feature_flags
  for each row execute function public.start_token_program();

-- ---- client RPCs ------------------------------------------------------------------

-- Everything the Rewards screen shows, for the caller only.
-- Not STABLE: claim_daily_tokens calls it right after inserting, and must see
-- its own row. History is the newest 50 entries; the data export asks for all.
create or replace function public.my_rewards(p_history_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tz  text;
  v_day date;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  v_tz := coalesce((select tz from public.token_accounts where user_id = v_uid), 'UTC');
  v_day := (now() at time zone v_tz)::date;
  return jsonb_build_object(
    'enabled', public.rewards_on(),
    'balance', (select coalesce(sum(amount), 0) from public.token_ledger
                 where user_id = v_uid
                   and (status = 'available' or (status = 'pending' and matures_at <= now()))),
    'pending', (select coalesce(sum(amount), 0) from public.token_ledger
                 where user_id = v_uid and status = 'pending' and matures_at > now()),
    'claimedToday', exists (select 1 from public.token_ledger
                             where user_id = v_uid and kind = 'daily_claim' and earned_on = v_day),
    'nextClaimAt', ((v_day + 1)::timestamp at time zone v_tz),
    'rules', (select jsonb_object_agg(key,
                jsonb_build_object('tokens', tokens, 'dailyCap', daily_cap) || settings)
                from public.token_rules),
    'today', coalesce((select jsonb_object_agg(kind, n) from (
                select kind, count(*) as n from public.token_ledger
                 where user_id = v_uid and earned_on = v_day
                   and kind in ('rating_solo', 'rating_group', 'take')
                 group by kind) t), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(h order by h.id desc) from (
                select l.id, l.kind, l.amount, l.status, l.matures_at as "maturesAt",
                       l.created_at as "createdAt", l.detail ->> 'reason' as reason,
                       t.name as "titleName", t.tmdb_id as "tmdbId", t.media_type as "mediaType"
                  from public.token_ledger l
                  left join public.titles t on t.id = l.title_id
                 where l.user_id = v_uid
                 order by l.id desc
                 limit greatest(1, least(coalesce(p_history_limit, 50), 5000))) h), '[]'::jsonb)
  );
end;
$$;

-- The daily token. The zone defines "today"; it is set by the first claim
-- and can change once every 30 days.
create or replace function public.claim_daily_tokens(p_tz text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_acct  record;
  v_tz    text := nullif(btrim(coalesce(p_tz, '')), '');
  v_award integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not public.rewards_on() then raise exception 'tokens are not available right now'; end if;

  insert into public.token_accounts (user_id) values (v_uid) on conflict do nothing;
  select * into v_acct from public.token_accounts where user_id = v_uid for update;
  if v_tz is not null and v_tz <> v_acct.tz
     and (v_acct.tz_changed_at is null or v_acct.tz_changed_at < now() - interval '30 days')
     and exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    update public.token_accounts set tz = v_tz, tz_changed_at = now() where user_id = v_uid;
  end if;

  v_award := public.award_tokens(v_uid, 'daily_claim',
    (select tokens from public.token_rules where key = 'daily_claim'));
  return jsonb_build_object('claimed', v_award > 0, 'awarded', v_award) || public.my_rewards();
end;
$$;

-- Whether a public take on this film can still earn (drives the composer's
-- bonus hint, so it never promises tokens the server will not pay).
create or replace function public.take_reward_open(p_title_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_cap integer;
begin
  if v_uid is null or not public.rewards_on() then return false; end if;
  if coalesce((select banned from public.profiles where id = v_uid), true) then return false; end if;
  if exists (select 1 from public.token_ineligible
              where user_id = v_uid and title_id = p_title_id and kind = 'take') then
    return false;
  end if;
  if exists (select 1 from public.token_ledger
              where user_id = v_uid and title_id = p_title_id and kind = 'take') then
    return false;
  end if;
  select daily_cap into v_cap from public.token_rules where key = 'take';
  return v_cap is null or (select count(*) from public.token_ledger
                            where user_id = v_uid and kind = 'take'
                              and earned_on = public.reward_day(v_uid)) < v_cap;
end;
$$;

-- ---- grants (the GRANTS LAW) ----------------------------------------------------

-- client RPCs
revoke all on function public.my_rewards(integer) from public, anon;
revoke all on function public.claim_daily_tokens(text) from public, anon;
revoke all on function public.take_reward_open(uuid) from public, anon;
grant execute on function public.my_rewards(integer) to authenticated;
grant execute on function public.claim_daily_tokens(text) to authenticated;
grant execute on function public.take_reward_open(uuid) to authenticated;

-- internals: not an API, even signed in
revoke all on function public.rewards_on() from public, anon, authenticated;
revoke all on function public.reward_day(uuid) from public, anon, authenticated;
revoke all on function public.award_tokens(uuid, text, integer, uuid, uuid, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.award_rating(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.award_movie_night(uuid) from public, anon, authenticated;
revoke all on function public.take_is_substantial(text) from public, anon, authenticated;
revoke all on function public.take_digest(text) from public, anon, authenticated;
revoke all on function public.reconcile_take(uuid) from public, anon, authenticated;
revoke all on function public.reward_solo_rating() from public, anon, authenticated;
revoke all on function public.reward_session_revealed() from public, anon, authenticated;
revoke all on function public.reward_locked_card() from public, anon, authenticated;
revoke all on function public.reward_take() from public, anon, authenticated;
revoke all on function public.reward_take_changed() from public, anon, authenticated;
revoke all on function public.reward_take_reaction() from public, anon, authenticated;
revoke all on function public.start_token_program() from public, anon, authenticated;

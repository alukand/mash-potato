-- Round games: a fight over the biggest split, and the vote for the best take.
--
-- Two games ride a group's rounds. The owner switches them (groups.fights,
-- groups.takes_mode) like any other group setting.
--
--   * THE FIGHT. When a round reveals with a real split, the highest and the
--     lowest scorer on the most contested category each make ONE argument.
--     "Most contested" is the Reveal headline's own pick (mostContestedCategory
--     in src/lib/scoring.ts: widest range among categories two or more locked
--     cards rated, ties to the earlier category in the snapshot). A fight
--     needs a range of 3 or more and three locked cards: two to fight, one to
--     judge. Arguments are sealed until both are in; then the other players
--     judge for a day. A late card can start the fight a reveal did not, for a
--     day after the reveal.
--   * BEST TAKE. Everyone writes a take and the group votes for the best one.
--     'blind': written with the scorecard, sealed like the scores, dropped
--     together at the reveal. 'after': written once the scores are out. The
--     mode is snapshotted onto the round when it starts, like the rubric.
--     Votes close a day after the reveal, or (blind) once every player voted.
--
-- THE ONE RULE carries over whole. Everything a game shows is part of the
-- reveal, so it opens per member exactly when the scores do: the round is
-- revealed AND your own card is locked (has_locked_scorecard). Fighters are
-- named BY their scores, so someone who has not scored sees no fight at all,
-- and a blind take is readable by its author alone until the reveal. The
-- tables are RPC-only; round_game_state is the one read.
--
-- Votes are sealed until a game closes (no bandwagon) and anonymous for good.
-- Only players count: members with a locked card in the round, still in the
-- group, not banned. Results are computed on read, so nothing needs a cron and
-- nothing cached can drift; the only stored decision is an early close.
--
-- Wins are peer-given, group-scoped and cosmetic (DESIGN.md reward-loop law,
-- amended 2026-10-03). group_trophies counts each member's wins for the
-- group's trophy shelf: counts only, never a session, category or score. A
-- forfeit is not a win: every trophy was voted for.
--
-- Takes and arguments are user-generated content: the wordlist, the terms
-- gate, the ban switch, a rate limit, reports (three hide it), blocks, and
-- the moderation queue all apply, as they do to comments.
--
-- Also closes a hole this feature would otherwise lean on: the owner or the
-- starter of a round could UPDATE its row directly (any column: the reveal
-- time, the group it belongs to). No version of the app ever did; reveal,
-- late scoring and cancelling are definer RPCs. Client UPDATE is revoked, and a
-- client INSERT now always starts blind, unrevealed, timestamped now, with the
-- group's takes mode.

-- ---- settings and the round snapshot ------------------------------------------

alter table public.groups
  add column fights boolean not null default true,
  add column takes_mode text not null default 'off'
    check (takes_mode in ('off', 'blind', 'after'));

alter table public.reveal_sessions
  add column takes_mode text not null default 'off'
    check (takes_mode in ('off', 'blind', 'after')),
  -- set once, when every player has voted on a blind round's takes
  add column takes_decided_at timestamptz;

-- ---- a round's row is not the client's to write ------------------------------

drop policy sessions_update_owner_or_creator on public.reveal_sessions;
revoke update on public.reveal_sessions from authenticated, anon;

-- INVOKER on purpose: current_user is then the role that inserted, so a client
-- insert is normalised and a test fixture (superuser) is left as written.
create function public.stamp_new_session()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.state := 'blind';
    new.revealed_at := null;
    new.created_at := now();
    new.takes_decided_at := null;
    new.takes_mode := coalesce(
      (select g.takes_mode from public.groups g where g.id = new.group_id), 'off');
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_new_session() from public, anon, authenticated;

create trigger reveal_sessions_stamp
  before insert on public.reveal_sessions
  for each row execute function public.stamp_new_session();

-- ---- tables -------------------------------------------------------------------

create table public.round_fights (
  session_id      uuid primary key references public.reveal_sessions (id) on delete cascade,
  group_id        uuid not null references public.groups (id) on delete cascade,
  category_key    text not null,
  -- the snapshot's label, so the fight reads right away from its round
  category_label  text not null,
  high_member_id  uuid not null references public.profiles (id) on delete cascade,
  high_score      numeric not null,
  low_member_id   uuid not null references public.profiles (id) on delete cascade,
  low_score       numeric not null,
  created_at      timestamptz not null default now(),
  -- set once, when every judge has voted before the clock ran out
  decided_at      timestamptz,
  constraint round_fights_two_fighters check (high_member_id <> low_member_id),
  constraint round_fights_split check (high_score > low_score)
);
create index round_fights_group_idx on public.round_fights (group_id);

create table public.round_posts (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.reveal_sessions (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('take', 'argument')),
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- three distinct reporters hide it pending review
  auto_hidden boolean not null default false,
  -- moderator removal; invisible to everyone, the author included
  removed     boolean not null default false,
  constraint round_posts_one_each unique (session_id, author_id, kind),
  constraint round_posts_body_len check (
    char_length(body) between 1 and (case kind when 'take' then 500 else 280 end))
);
create index round_posts_author_idx on public.round_posts (author_id);

create table public.round_votes (
  session_id uuid not null references public.reveal_sessions (id) on delete cascade,
  game       text not null check (game in ('take', 'fight')),
  voter_id   uuid not null references public.profiles (id) on delete cascade,
  -- the take's author, or the fighter
  choice_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, game, voter_id),
  constraint round_votes_not_self check (voter_id <> choice_id)
);

create table public.round_post_reports (
  post_id     uuid not null references public.round_posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 500),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution  text check (resolution in ('dismissed', 'removed', 'banned')),
  primary key (post_id, reporter_id)
);
create index round_post_reports_open_idx on public.round_post_reports (created_at)
  where resolved_at is null;

-- RPC-only, every one of them: the reads carry THE ONE RULE, which a policy
-- spread over four tables would restate four times.
alter table public.round_fights enable row level security;
alter table public.round_posts enable row level security;
alter table public.round_votes enable row level security;
alter table public.round_post_reports enable row level security;
revoke all on public.round_fights, public.round_posts, public.round_votes,
              public.round_post_reports
  from public, anon, authenticated;
-- send-push names a fight's category in the fighters' alert (resolved there,
-- never carried in a payload), so the service role reads this one table.
-- Said explicitly, like feature_flags: hosted defaults may grant it, a local
-- reset does not.
grant select on public.round_fights to service_role;

-- ---- internals ----------------------------------------------------------------

-- The people who played a round: a locked card, and still in the group.
create function public.round_players(p_session_id uuid)
returns table (member_id uuid, banned boolean)
language sql stable security definer set search_path = '' as $$
  select ms.member_id, p.banned
    from public.member_scores ms
    join public.reveal_sessions s on s.id = ms.session_id
    join public.group_members gm on gm.group_id = s.group_id and gm.user_id = ms.member_id
    join public.profiles p on p.id = ms.member_id
   where ms.session_id = p_session_id and ms.locked;
$$;
revoke all on function public.round_players(uuid) from public, anon, authenticated;

-- When a revealed round's best-take vote closes (null: no takes, or blind).
create function public.takes_close_at(p_session_id uuid)
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce(s.takes_decided_at, s.revealed_at + interval '24 hours')
    from public.reveal_sessions s
   where s.id = p_session_id and s.state = 'revealed' and s.takes_mode <> 'off';
$$;
revoke all on function public.takes_close_at(uuid) from public, anon, authenticated;

-- Every take that can win, with its votes. A take counts when it is visible
-- (not hidden, not removed) and its author played; a vote counts when its
-- voter plays and is not banned. Winners exist only once the vote is closed,
-- with two takes or more, and with at least one vote: ties share the win.
create function public.take_results(p_session_id uuid)
returns table (post_id uuid, author_id uuid, votes integer, winner boolean)
language sql stable security definer set search_path = '' as $$
  with players as (
    select rp.member_id, rp.banned from public.round_players(p_session_id) rp
  ), tally as (
    select p.id, p.author_id,
           (select count(*) from public.round_votes v
             where v.session_id = p_session_id and v.game = 'take'
               and v.choice_id = p.author_id
               and v.voter_id in (select pl.member_id from players pl where not pl.banned)
           )::integer as votes
      from public.round_posts p
     where p.session_id = p_session_id and p.kind = 'take'
       and not p.removed and not p.auto_hidden
       and p.author_id in (select pl.member_id from players pl)
  )
  select t.id, t.author_id, t.votes,
         coalesce(now() >= public.takes_close_at(p_session_id), false)
           and (select count(*) from tally) >= 2
           and t.votes > 0
           and t.votes = (select max(x.votes) from tally x)
    from tally t;
$$;
revoke all on function public.take_results(uuid) from public, anon, authenticated;

-- Where a fight stands, for everyone at once (no viewer in here).
--   arguing: until both arguments are in, for a day from the start
--   judging: a day from the second argument, or until every judge voted
--   closed:  win (more votes), draw (equal, including nobody voting),
--            forfeit (only one visible argument), no_show (none)
-- Judges are the players who are neither fighter, not banned, and not
-- blocked with either fighter (they could not read both sides).
create function public.fight_status(p_session_id uuid)
returns table (
  phase text, arguments_due timestamptz, both_in_at timestamptz,
  closes_at timestamptz, judges integer, voted integer,
  high_votes integer, low_votes integer, outcome text, winner_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  f      public.round_fights;
  a_high public.round_posts;
  a_low  public.round_posts;
  v_due  timestamptz;
  v_both timestamptz;
  v_close timestamptz;
  v_phase text;
  v_judges integer;
  v_voted integer;
  v_hv integer;
  v_lv integer;
  v_high_ok boolean;
  v_low_ok boolean;
  v_outcome text;
  v_winner uuid;
begin
  select * into f from public.round_fights rf where rf.session_id = p_session_id;
  if f.session_id is null then return; end if;
  select * into a_high from public.round_posts p
   where p.session_id = p_session_id and p.kind = 'argument' and p.author_id = f.high_member_id;
  select * into a_low from public.round_posts p
   where p.session_id = p_session_id and p.kind = 'argument' and p.author_id = f.low_member_id;

  v_due := f.created_at + interval '24 hours';
  -- a removed argument still counts as made: moderation never reopens a phase
  if a_high.id is not null and a_low.id is not null then
    v_both := greatest(a_high.created_at, a_low.created_at);
    v_close := coalesce(f.decided_at, v_both + interval '24 hours');
  else
    v_close := v_due;
  end if;

  if v_both is null and now() < v_due then
    v_phase := 'arguing';
  elsif v_both is not null and now() < v_close then
    v_phase := 'judging';
  else
    v_phase := 'closed';
  end if;

  with jury as (
    select rp.member_id from public.round_players(p_session_id) rp
     where not rp.banned
       and rp.member_id not in (f.high_member_id, f.low_member_id)
       and not public.is_blocked_pair(rp.member_id, f.high_member_id)
       and not public.is_blocked_pair(rp.member_id, f.low_member_id)
  )
  select (select count(*) from jury)::integer,
         count(v.voter_id)::integer,
         (count(*) filter (where v.choice_id = f.high_member_id))::integer,
         (count(*) filter (where v.choice_id = f.low_member_id))::integer
    into v_judges, v_voted, v_hv, v_lv
    from public.round_votes v
   where v.session_id = p_session_id and v.game = 'fight'
     and v.voter_id in (select j.member_id from jury j);

  if v_phase = 'closed' then
    v_high_ok := a_high.id is not null and not a_high.removed and not a_high.auto_hidden;
    v_low_ok := a_low.id is not null and not a_low.removed and not a_low.auto_hidden;
    if v_high_ok and v_low_ok then
      if v_hv > v_lv then
        v_outcome := 'win'; v_winner := f.high_member_id;
      elsif v_lv > v_hv then
        v_outcome := 'win'; v_winner := f.low_member_id;
      else
        v_outcome := 'draw';
      end if;
    elsif v_high_ok then
      v_outcome := 'forfeit'; v_winner := f.high_member_id;
    elsif v_low_ok then
      v_outcome := 'forfeit'; v_winner := f.low_member_id;
    else
      v_outcome := 'no_show';
    end if;
  end if;

  return query select v_phase, v_due, v_both, v_close, v_judges, v_voted,
                      v_hv, v_lv, v_outcome, v_winner;
end;
$$;
revoke all on function public.fight_status(uuid) from public, anon, authenticated;

-- The checks every game text passes, in the words comments use.
create function public.check_round_text(p_body text, p_max integer, p_noun text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if char_length(p_body) > p_max then
    raise exception 'keep your % to % characters', p_noun, p_max;
  end if;
  -- line breaks are fine; other control characters are not
  if p_body ~ '[\x00-\x09\x0B-\x1F\x7F]' then
    raise exception 'that % is not usable', p_noun;
  end if;
  if exists (select 1 from public.banned_terms t where p_body ~* ('\m' || t.term || '\M')) then
    raise exception 'that % contains language that is not allowed here', p_noun;
  end if;
end;
$$;
revoke all on function public.check_round_text(text, integer, text) from public, anon, authenticated;

-- ---- starting a fight ---------------------------------------------------------

-- Idempotent: the reveal calls it, and so does every card locked after it
-- (for a day), so a round that revealed on two cards can still start its
-- fight when the third arrives. Once a fight exists, nothing changes it.
create function public.start_round_fight(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s       public.reveal_sessions;
  v_key   text;
  v_label text;
  v_range numeric;
  v_high  uuid;
  v_high_score numeric;
  v_low   uuid;
  v_low_score numeric;
begin
  select * into s from public.reveal_sessions where id = p_session_id;
  if s.id is null or s.state <> 'revealed' or s.revealed_at is null then return; end if;
  if now() > s.revealed_at + interval '24 hours' then return; end if;
  if jsonb_typeof(s.rubric) is distinct from 'array' then return; end if;
  if not coalesce((select g.fights from public.groups g where g.id = s.group_id), false) then
    return;
  end if;
  if exists (select 1 from public.round_fights where session_id = s.id) then return; end if;
  -- two to fight, one to judge
  if (select count(*) from public.round_players(s.id)) < 3 then return; end if;

  -- the Reveal headline's split: widest range, 2+ raters, ties to the earlier
  -- category in the snapshot (lib/scoring.ts mostContestedCategory)
  select c.key, c.label, c.spread into v_key, v_label, v_range
    from (
      select e.value ->> 'key' as key,
             coalesce(nullif(e.value ->> 'label', ''), e.value ->> 'key') as label,
             e.ord,
             max((ms.scores ->> (e.value ->> 'key'))::numeric)
               - min((ms.scores ->> (e.value ->> 'key'))::numeric) as spread
        from jsonb_array_elements(s.rubric) with ordinality as e(value, ord)
        join public.member_scores ms
          on ms.session_id = s.id and ms.locked
         and jsonb_typeof(ms.scores -> (e.value ->> 'key')) = 'number'
       where jsonb_typeof(e.value) = 'object'
         and coalesce(e.value ->> 'key', '') <> ''
       group by e.value, e.ord
      having count(*) >= 2
    ) c
   order by c.spread desc, c.ord asc
   limit 1;
  if v_key is null or v_range < 3 then return; end if;

  -- the two corners: ties go to whoever started their card first
  select ms.member_id, (ms.scores ->> v_key)::numeric into v_high, v_high_score
    from public.member_scores ms
    join public.round_players(s.id) rp on rp.member_id = ms.member_id
   where ms.session_id = s.id and ms.locked and jsonb_typeof(ms.scores -> v_key) = 'number'
   order by (ms.scores ->> v_key)::numeric desc, ms.created_at, ms.member_id
   limit 1;
  select ms.member_id, (ms.scores ->> v_key)::numeric into v_low, v_low_score
    from public.member_scores ms
    join public.round_players(s.id) rp on rp.member_id = ms.member_id
   where ms.session_id = s.id and ms.locked and jsonb_typeof(ms.scores -> v_key) = 'number'
   order by (ms.scores ->> v_key)::numeric asc, ms.created_at, ms.member_id
   limit 1;
  if v_high is null or v_low is null or v_high = v_low or v_high_score - v_low_score < 3 then
    return;
  end if;
  -- no fight between people who blocked each other, or with a banned account
  if public.is_blocked_pair(v_high, v_low)
     or exists (select 1 from public.profiles where id in (v_high, v_low) and banned) then
    return;
  end if;

  insert into public.round_fights (session_id, group_id, category_key, category_label,
                                   high_member_id, high_score, low_member_id, low_score)
  values (s.id, s.group_id, v_key, left(v_label, 60), v_high, v_high_score, v_low, v_low_score)
  on conflict (session_id) do nothing;
  if not found then return; end if;

  -- ID-only, like every push: the scores never ride a notification
  perform public.push_notify(jsonb_build_object(
    'event', 'fight_started', 'session_id', s.id, 'group_id', s.group_id,
    'recipient_id', v_high, 'actor_id', v_low));
  perform public.push_notify(jsonb_build_object(
    'event', 'fight_started', 'session_id', s.id, 'group_id', s.group_id,
    'recipient_id', v_low, 'actor_id', v_high));
end;
$$;
revoke all on function public.start_round_fight(uuid) from public, anon, authenticated;

create function public.fight_on_reveal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'revealed' and old.state is distinct from 'revealed' then
    perform public.start_round_fight(new.id);
  end if;
  return null;
end;
$$;
revoke all on function public.fight_on_reveal() from public, anon, authenticated;
create trigger reveal_sessions_fight
  after update of state on public.reveal_sessions
  for each row execute function public.fight_on_reveal();

create function public.fight_on_late_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.locked and (tg_op = 'INSERT' or not old.locked) then
    perform public.start_round_fight(new.session_id);
  end if;
  return null;
end;
$$;
revoke all on function public.fight_on_late_card() from public, anon, authenticated;
create trigger member_scores_fight
  after insert or update of locked on public.member_scores
  for each row execute function public.fight_on_late_card();

-- ---- the read -----------------------------------------------------------------

-- Everything the round's games show this viewer, as one document.
--   Blind round, or revealed but your card is not locked: only your own take.
--   Revealed and your card locked: the takes and the fight, with tallies
--   only once a game is closed.
create function public.round_game_state(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  s         public.reveal_sessions;
  v_banned  boolean;
  v_my_take jsonb;
  v_takes   jsonb;
  v_entries jsonb;
  v_close   timestamptz;
  v_closed  boolean;
  v_fight   jsonb;
  f         public.round_fights;
  st        record;
  a_high    public.round_posts;
  a_low     public.round_posts;
  v_role    text;
  v_show_high boolean;
  v_show_low  boolean;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select * into s from public.reveal_sessions where id = p_session_id;
  if s.id is null or not public.is_group_member(s.group_id) then
    raise exception 'that round is not in your groups';
  end if;
  select coalesce(p.banned, false) into v_banned from public.profiles p where p.id = v_uid;

  select jsonb_build_object('body', p.body, 'hidden', p.auto_hidden) into v_my_take
    from public.round_posts p
   where p.session_id = s.id and p.author_id = v_uid and p.kind = 'take' and not p.removed;

  -- THE ONE RULE: nobody else's words, and no fight, until the reveal is open for you
  if not (s.state = 'revealed' and public.has_locked_scorecard(s.id)) then
    return jsonb_build_object(
      'takes_mode', s.takes_mode, 'sealed', s.state = 'revealed',
      'my_take', v_my_take, 'takes', null, 'fight', null);
  end if;

  if s.takes_mode <> 'off' then
    v_close := public.takes_close_at(s.id);
    v_closed := now() >= v_close;
    select coalesce(jsonb_agg(jsonb_build_object(
             'post_id', p.id,
             'author_id', p.author_id,
             'body', p.body,
             'mine', p.author_id = v_uid,
             'hidden', p.auto_hidden,
             'votes', case when v_closed then coalesce(r.votes, 0) end,
             'winner', coalesce(r.winner, false))
             order by p.created_at, p.id), '[]'::jsonb)
      into v_entries
      from public.round_posts p
      left join public.take_results(s.id) r on r.post_id = p.id
     where p.session_id = s.id and p.kind = 'take' and not p.removed
       and (p.author_id = v_uid or not p.auto_hidden)
       and (p.author_id = v_uid or not public.is_blocked_pair(v_uid, p.author_id))
       and exists (select 1 from public.round_players(s.id) rp where rp.member_id = p.author_id);

    v_takes := jsonb_build_object(
      'closes_at', v_close,
      'closed', v_closed,
      'can_write', s.takes_mode = 'after' and not v_closed and not v_banned,
      'can_vote', not v_closed and not v_banned
                  and (select count(*) from public.take_results(s.id)) >= 2,
      'my_vote', (select v.choice_id from public.round_votes v
                   where v.session_id = s.id and v.game = 'take' and v.voter_id = v_uid),
      'voted', (select count(*) from public.round_votes v
                 join public.round_players(s.id) rp on rp.member_id = v.voter_id and not rp.banned
                where v.session_id = s.id and v.game = 'take'),
      'eligible', (select count(*) from public.round_players(s.id) rp where not rp.banned),
      'entries', v_entries);
  end if;

  select * into f from public.round_fights rf where rf.session_id = s.id;
  if f.session_id is not null then
    select * into st from public.fight_status(s.id);
    select * into a_high from public.round_posts p
     where p.session_id = s.id and p.kind = 'argument' and p.author_id = f.high_member_id;
    select * into a_low from public.round_posts p
     where p.session_id = s.id and p.kind = 'argument' and p.author_id = f.low_member_id;
    v_role := case
      when v_uid = f.high_member_id then 'high'
      when v_uid = f.low_member_id then 'low'
      when v_banned
        or public.is_blocked_pair(v_uid, f.high_member_id)
        or public.is_blocked_pair(v_uid, f.low_member_id) then 'watcher'
      else 'judge' end;
    -- your own argument always; the other side's once both are in (sealed
    -- until then), unless it is hidden or you blocked each other
    v_show_high := a_high.id is not null and not a_high.removed
      and (a_high.author_id = v_uid
           or (st.phase <> 'arguing' and not a_high.auto_hidden
               and not public.is_blocked_pair(v_uid, a_high.author_id)));
    v_show_low := a_low.id is not null and not a_low.removed
      and (a_low.author_id = v_uid
           or (st.phase <> 'arguing' and not a_low.auto_hidden
               and not public.is_blocked_pair(v_uid, a_low.author_id)));
    v_fight := jsonb_build_object(
      'category_key', f.category_key,
      'category_label', f.category_label,
      'phase', st.phase,
      'arguments_due', st.arguments_due,
      'closes_at', case when st.both_in_at is not null then st.closes_at end,
      'me', v_role,
      'my_vote', (select v.choice_id from public.round_votes v
                   where v.session_id = s.id and v.game = 'fight' and v.voter_id = v_uid),
      'judges', st.judges,
      'voted', st.voted,
      'outcome', st.outcome,
      'winner_id', st.winner_id,
      'high', jsonb_build_object(
        'member_id', f.high_member_id,
        'score', f.high_score,
        'argued', a_high.id is not null,
        'post_id', case when v_show_high then a_high.id end,
        'argument', case when v_show_high then a_high.body end,
        'hidden', a_high.id is not null and not v_show_high and st.phase <> 'arguing',
        'votes', case when st.phase = 'closed' then st.high_votes end),
      'low', jsonb_build_object(
        'member_id', f.low_member_id,
        'score', f.low_score,
        'argued', a_low.id is not null,
        'post_id', case when v_show_low then a_low.id end,
        'argument', case when v_show_low then a_low.body end,
        'hidden', a_low.id is not null and not v_show_low and st.phase <> 'arguing',
        'votes', case when st.phase = 'closed' then st.low_votes end));
  end if;

  return jsonb_build_object(
    'takes_mode', s.takes_mode, 'sealed', false,
    'my_take', v_my_take, 'takes', v_takes, 'fight', v_fight);
end;
$$;
revoke all on function public.round_game_state(uuid) from public, anon;
grant execute on function public.round_game_state(uuid) to authenticated;

-- ---- writing ------------------------------------------------------------------

-- Save (or, with an empty body, delete) your take on a round.
--   blind: only while the round is blind: it is part of your sealed card
--   after: once the reveal is open for you, until the vote closes, and only
--          until someone votes for it (no changing words under a vote)
create function public.save_round_take(p_session_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  s      public.reveal_sessions;
  v_post public.round_posts;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then
    raise exception 'posting is disabled for this account';
  end if;
  select * into s from public.reveal_sessions where id = p_session_id for update;
  if s.id is null or not public.is_group_member(s.group_id) then
    raise exception 'that round is not in your groups';
  end if;
  if s.takes_mode = 'off' then raise exception 'this round has no takes'; end if;
  if s.takes_mode = 'blind' and s.state <> 'blind' then
    raise exception 'takes for this round sealed at the reveal';
  end if;
  if s.takes_mode = 'after' then
    if s.state <> 'revealed' or not public.has_locked_scorecard(s.id) then
      raise exception 'lock in your scores to write a take';
    end if;
    if now() >= public.takes_close_at(s.id) then
      raise exception 'voting on takes is over';
    end if;
  end if;

  select * into v_post from public.round_posts
   where session_id = s.id and author_id = v_uid and kind = 'take' for update;
  if v_post.id is not null and v_post.removed then
    raise exception 'that take was removed';
  end if;
  if v_post.id is not null and exists (
    select 1 from public.round_votes v
     where v.session_id = s.id and v.game = 'take' and v.choice_id = v_uid
  ) then
    raise exception 'your take has votes now, so it stays as it is';
  end if;

  if v_body is null then
    delete from public.round_posts where id = v_post.id;
    return;
  end if;
  if (select accepted_terms_at from public.profiles where id = v_uid) is null then
    raise exception 'accept the community terms first';
  end if;
  perform public.check_round_text(v_body, 500, 'take');
  perform public.consume_rate_limit('round_post', 30, 3600);

  insert into public.round_posts (session_id, group_id, author_id, kind, body)
  values (s.id, s.group_id, v_uid, 'take', v_body)
  on conflict (session_id, author_id, kind)
    do update set body = excluded.body, updated_at = now();

  -- a new take after the reveal: ping realtime so open reveals pick it up
  -- (a blind take is sealed; nobody else has anything to refresh)
  if s.takes_mode = 'after' then
    update public.reveal_sessions set state = state where id = s.id;
  end if;
end;
$$;
revoke all on function public.save_round_take(uuid, text) from public, anon;
grant execute on function public.save_round_take(uuid, text) to authenticated;

-- A fighter's one argument: editable (or deletable, with an empty body) until
-- the other fighter's is in too, then it stands.
create function public.save_fight_argument(p_session_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  f      public.round_fights;
  v_post public.round_posts;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then
    raise exception 'posting is disabled for this account';
  end if;
  -- the row lock serialises the two fighters, so "both are in" is exact
  select * into f from public.round_fights where session_id = p_session_id for update;
  if f.session_id is null or not public.is_group_member(f.group_id) then
    raise exception 'this round has no fight';
  end if;
  if v_uid not in (f.high_member_id, f.low_member_id) then
    raise exception 'only the two fighters make arguments';
  end if;
  if (select fs.phase from public.fight_status(p_session_id) fs) <> 'arguing' then
    raise exception 'arguments for this fight are closed';
  end if;

  select * into v_post from public.round_posts
   where session_id = p_session_id and author_id = v_uid and kind = 'argument' for update;
  if v_post.id is not null and v_post.removed then
    raise exception 'that argument was removed';
  end if;
  if v_body is null then
    delete from public.round_posts where id = v_post.id;
    return;
  end if;
  if (select accepted_terms_at from public.profiles where id = v_uid) is null then
    raise exception 'accept the community terms first';
  end if;
  perform public.check_round_text(v_body, 280, 'argument');
  perform public.consume_rate_limit('round_post', 30, 3600);

  insert into public.round_posts (session_id, group_id, author_id, kind, body)
  values (p_session_id, f.group_id, v_uid, 'argument', v_body)
  on conflict (session_id, author_id, kind)
    do update set body = excluded.body, updated_at = now();

  -- both in: the arguments drop and judging opens, so ping open reveals
  if (select count(*) from public.round_posts
       where session_id = p_session_id and kind = 'argument'
         and author_id in (f.high_member_id, f.low_member_id)) = 2 then
    update public.reveal_sessions set state = state where id = p_session_id;
  end if;
end;
$$;
revoke all on function public.save_fight_argument(uuid, text) from public, anon;
grant execute on function public.save_fight_argument(uuid, text) to authenticated;

-- One vote per game per player, switchable until the game closes; a null
-- choice takes it back. p_game: 'take' (the choice is the take's author) or
-- 'fight' (one of the two fighters).
create function public.cast_round_vote(p_session_id uuid, p_game text, p_choice uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s     public.reveal_sessions;
  f     public.round_fights;
  st    record;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.profiles where id = v_uid and banned) then
    raise exception 'voting is unavailable for this account';
  end if;
  select * into s from public.reveal_sessions where id = p_session_id for update;
  if s.id is null or not public.is_group_member(s.group_id) then
    raise exception 'that round is not in your groups';
  end if;
  if s.state <> 'revealed' or not public.has_locked_scorecard(s.id) then
    raise exception 'lock in your scores to vote';
  end if;

  if p_game = 'fight' then
    select * into f from public.round_fights where session_id = s.id for update;
    if f.session_id is null then raise exception 'this round has no fight'; end if;
    if v_uid in (f.high_member_id, f.low_member_id) then
      raise exception 'fighters do not judge their own fight';
    end if;
    if public.is_blocked_pair(v_uid, f.high_member_id)
       or public.is_blocked_pair(v_uid, f.low_member_id) then
      raise exception 'you cannot judge this fight';
    end if;
    select * into st from public.fight_status(s.id);
    if st.phase <> 'judging' then raise exception 'judging is not open'; end if;
    if p_choice is null then
      delete from public.round_votes
       where session_id = s.id and game = 'fight' and voter_id = v_uid;
      return;
    end if;
    if p_choice not in (f.high_member_id, f.low_member_id) then
      raise exception 'pick one of the two fighters';
    end if;
    insert into public.round_votes (session_id, game, voter_id, choice_id)
    values (s.id, 'fight', v_uid, p_choice)
    on conflict (session_id, game, voter_id)
      do update set choice_id = excluded.choice_id, updated_at = now();
    -- every judge has voted: the bell rings now
    select * into st from public.fight_status(s.id);
    if st.judges > 0 and st.voted >= st.judges then
      update public.round_fights set decided_at = now()
       where session_id = s.id and decided_at is null;
      update public.reveal_sessions set state = state where id = s.id;
    end if;

  elsif p_game = 'take' then
    if s.takes_mode = 'off' then raise exception 'this round has no takes'; end if;
    if now() >= public.takes_close_at(s.id) then
      raise exception 'voting on takes is over';
    end if;
    if p_choice is null then
      delete from public.round_votes
       where session_id = s.id and game = 'take' and voter_id = v_uid;
      return;
    end if;
    if p_choice = v_uid then raise exception 'you cannot vote for your own take'; end if;
    if (select count(*) from public.take_results(s.id)) < 2 then
      raise exception 'a vote needs at least two takes';
    end if;
    if public.is_blocked_pair(v_uid, p_choice)
       or not exists (select 1 from public.take_results(s.id) r where r.author_id = p_choice) then
      raise exception 'that take is not open to votes';
    end if;
    insert into public.round_votes (session_id, game, voter_id, choice_id)
    values (s.id, 'take', v_uid, p_choice)
    on conflict (session_id, game, voter_id)
      do update set choice_id = excluded.choice_id, updated_at = now();
    -- a blind round's takes were all in at the reveal, so once every player
    -- has voted the result is final (an 'after' round runs its full day: a
    -- take could still be coming)
    if s.takes_mode = 'blind' and not exists (
      select 1 from public.round_players(s.id) rp
       where not rp.banned
         and not exists (select 1 from public.round_votes v
                          where v.session_id = s.id and v.game = 'take'
                            and v.voter_id = rp.member_id)
    ) then
      update public.reveal_sessions set takes_decided_at = now()
       where id = s.id and takes_decided_at is null;
    end if;

  else
    raise exception 'that is not a game';
  end if;
end;
$$;
revoke all on function public.cast_round_vote(uuid, text, uuid) from public, anon;
grant execute on function public.cast_round_vote(uuid, text, uuid) to authenticated;

-- ---- reporting ----------------------------------------------------------------

-- Report a take or an argument you can see. One refusal for everything you
-- cannot report, so a report is never a probe for what exists.
create function public.report_round_post(p_post_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  p        public.round_posts;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select * into p from public.round_posts where id = p_post_id;
  if p.id is null or p.removed or p.auto_hidden or p.author_id = v_uid
     or not public.is_group_member(p.group_id)
     or not exists (select 1 from public.reveal_sessions s
                     where s.id = p.session_id and s.state = 'revealed')
     or not public.has_locked_scorecard(p.session_id)
     or public.is_blocked_pair(v_uid, p.author_id)
     or not exists (select 1 from public.round_players(p.session_id) rp
                     where rp.member_id = p.author_id)
     or (p.kind = 'argument'
         and (select fs.phase from public.fight_status(p.session_id) fs)
             is distinct from 'judging'
         and (select fs.phase from public.fight_status(p.session_id) fs)
             is distinct from 'closed') then
    raise exception 'that post is not available';
  end if;
  insert into public.round_post_reports (post_id, reporter_id, reason)
  values (p.id, v_uid, v_reason)
  on conflict (post_id, reporter_id) do nothing;
end;
$$;
revoke all on function public.report_round_post(uuid, text) from public, anon;
grant execute on function public.report_round_post(uuid, text) to authenticated;

-- Three distinct reporters hide it pending review, as with comments.
create function public.auto_hide_reported_round_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.round_post_reports where post_id = new.post_id) >= 3 then
    update public.round_posts set auto_hidden = true
     where id = new.post_id and not auto_hidden;
  end if;
  return new;
end;
$$;
revoke all on function public.auto_hide_reported_round_post() from public, anon, authenticated;
create trigger on_round_post_report_threshold
  after insert on public.round_post_reports
  for each row execute function public.auto_hide_reported_round_post();

-- ---- the trophy shelf ---------------------------------------------------------

-- Each current member's wins in this group: best takes and fights won on
-- votes. Counts only (no session, category or score), so the shelf says
-- nothing about a round to someone who has not played it.
create function public.group_trophies(p_group_id uuid)
returns table (user_id uuid, take_wins integer, fight_wins integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group';
  end if;
  return query
    with fight_winners as (
      select fs.winner_id
        from public.round_fights rf
        cross join lateral public.fight_status(rf.session_id) fs
       where rf.group_id = p_group_id and fs.outcome = 'win'
    ), take_winners as (
      select r.author_id
        from public.reveal_sessions rs
        cross join lateral public.take_results(rs.id) r
       where rs.group_id = p_group_id and rs.state = 'revealed'
         and rs.takes_mode <> 'off' and r.winner
    )
    select gm.user_id,
           (select count(*) from take_winners tw where tw.author_id = gm.user_id)::integer,
           (select count(*) from fight_winners fw where fw.winner_id = gm.user_id)::integer
      from public.group_members gm
     where gm.group_id = p_group_id
     order by gm.joined_at, gm.user_id;
end;
$$;
revoke all on function public.group_trophies(uuid) from public, anon;
grant execute on function public.group_trophies(uuid) to authenticated;

-- Your own takes and arguments, for your data export.
create function public.my_round_posts()
returns table (group_name text, title_name text, kind text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.name, t.name, p.kind, p.body, p.created_at
    from public.round_posts p
    join public.reveal_sessions s on s.id = p.session_id
    join public.titles t on t.id = s.title_id
    join public.groups g on g.id = p.group_id
   where p.author_id = (select auth.uid()) and not p.removed
   order by p.created_at desc;
$$;
revoke all on function public.my_round_posts() from public, anon;
grant execute on function public.my_round_posts() to authenticated;

-- ---- moderation: takes and arguments join the queue -----------------------------

alter table public.moderation_actions
  drop constraint moderation_actions_target_kind_check,
  add constraint moderation_actions_target_kind_check
    check (target_kind in ('comment', 'message', 'user', 'take', 'argument'));

-- Unchanged from 20260727180000 but for the third branch.
create or replace function public.moderation_queue()
returns table (
  kind           text,
  content_id     uuid,
  body           text,
  author_id      uuid,
  author_name    text,
  author_banned  boolean,
  report_count   integer,
  reasons        text[],
  first_reported timestamptz,
  already_hidden boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'not a moderator';
  end if;

  return query
  select 'comment'::text, c.id, c.body, c.author_id, p.display_name, p.banned,
         count(r.*)::integer,
         array_remove(array_agg(r.reason), null),
         min(r.created_at),
         c.auto_hidden
    from public.comment_reports r
    join public.title_comments c on c.id = r.comment_id
    join public.profiles p on p.id = c.author_id
   where r.resolved_at is null and not c.removed
   group by c.id, c.body, c.author_id, p.display_name, p.banned, c.auto_hidden

  union all

  select 'message'::text, m.id, m.body, m.sender_id, p.display_name, p.banned,
         count(r.*)::integer,
         array_remove(array_agg(r.reason), null),
         min(r.created_at),
         m.removed
    from public.message_reports r
    join public.messages m on m.id = r.message_id
    join public.profiles p on p.id = m.sender_id
   where r.resolved_at is null and not m.deleted
   group by m.id, m.body, m.sender_id, p.display_name, p.banned, m.removed

  union all

  -- a take or a fight argument, by its own kind
  select rp.kind, rp.id, rp.body, rp.author_id, p.display_name, p.banned,
         count(r.*)::integer,
         array_remove(array_agg(r.reason), null),
         min(r.created_at),
         rp.auto_hidden
    from public.round_post_reports r
    join public.round_posts rp on rp.id = r.post_id
    join public.profiles p on p.id = rp.author_id
   where r.resolved_at is null and not rp.removed
   group by rp.kind, rp.id, rp.body, rp.author_id, p.display_name, p.banned, rp.auto_hidden

   order by 9 asc;   -- oldest first: the 24-hour clock starts at first report
end;
$$;
revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- Unchanged from 20260727180000 but for takes and arguments: dismiss un-hides,
-- remove and ban remove, and every report on the post closes at once.
create or replace function public.resolve_report(
  p_kind text,
  p_content_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mod    uuid := (select auth.uid());
  v_author uuid;
begin
  if not public.is_moderator() then
    raise exception 'not a moderator';
  end if;
  if p_kind not in ('comment', 'message', 'take', 'argument') then
    raise exception 'that is not something you can moderate';
  end if;
  if p_action not in ('dismiss', 'remove', 'ban') then
    raise exception 'that is not an action';
  end if;

  if p_kind = 'comment' then
    select author_id into v_author from public.title_comments where id = p_content_id;
    if v_author is null then raise exception 'that comment is gone'; end if;

    if p_action = 'dismiss' then
      -- clear the auto-hide too, or a dismissed report still censors
      update public.title_comments set auto_hidden = false where id = p_content_id;
    else
      update public.title_comments set removed = true where id = p_content_id;
    end if;

    update public.comment_reports
       set resolved_at = now(), resolved_by = v_mod,
           resolution = case p_action when 'dismiss' then 'dismissed'
                                      when 'remove'  then 'removed'
                                      else 'banned' end
     where comment_id = p_content_id and resolved_at is null;
  elsif p_kind = 'message' then
    select sender_id into v_author from public.messages where id = p_content_id;
    if v_author is null then raise exception 'that message is gone'; end if;

    if p_action <> 'dismiss' then
      update public.messages set removed = true where id = p_content_id;
    end if;

    update public.message_reports
       set resolved_at = now(), resolved_by = v_mod,
           resolution = case p_action when 'dismiss' then 'dismissed'
                                      when 'remove'  then 'removed'
                                      else 'banned' end
     where message_id = p_content_id and resolved_at is null;
  else
    select author_id into v_author from public.round_posts
     where id = p_content_id and kind = p_kind;
    if v_author is null then raise exception 'that post is gone'; end if;

    if p_action = 'dismiss' then
      update public.round_posts set auto_hidden = false where id = p_content_id;
    else
      update public.round_posts set removed = true where id = p_content_id;
    end if;

    update public.round_post_reports
       set resolved_at = now(), resolved_by = v_mod,
           resolution = case p_action when 'dismiss' then 'dismissed'
                                      when 'remove'  then 'removed'
                                      else 'banned' end
     where post_id = p_content_id and resolved_at is null;
  end if;

  if p_action = 'ban' then
    update public.profiles set banned = true where id = v_author;
  end if;

  insert into public.moderation_actions
    (moderator_id, action, target_kind, target_id, target_user_id, note)
  values (v_mod,
          case p_action when 'dismiss' then 'dismiss'
                        when 'remove'  then 'remove'
                        else 'ban' end,
          p_kind, p_content_id, v_author, nullif(btrim(p_note), ''));
end;
$$;
revoke all on function public.resolve_report(text, uuid, text, text) from public, anon;
grant execute on function public.resolve_report(text, uuid, text, text) to authenticated;

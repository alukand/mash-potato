-- Moderation tooling: a queue, actions, and an audit trail.
--
-- Reporting, blocking and the wordlist have shipped since 2026-07-14, but
-- nothing could ACT on a report. Reports accumulated in `comment_reports` and
-- `message_reports`, `profiles.banned` was flippable only from the dashboard,
-- and triage meant hand-writing UPDATEs. App Store guideline 1.2 asks you to
-- attest that you act on reports within 24 hours, and hand-written SQL is not
-- a promise anyone can keep on a Sunday.
--
-- Three things are added: a moderator ROLE that cannot be self-granted,
-- RESOLUTION state so a queue can tell open from handled, and an append-only
-- AUDIT TRAIL so every action has a name and a reason attached to it.

-- ---- the role -------------------------------------------------------------
--
-- Same posture as `banned`: the column exists, but no client role may write
-- it. Bootstrapping a moderator is deliberately a dashboard/SQL act — an app
-- that can promote its own moderators has no privilege boundary at all.

alter table public.profiles
  add column is_moderator boolean not null default false;

revoke update (is_moderator) on public.profiles from authenticated, anon;
-- Readable by nobody but the definer helpers below: whether someone is a
-- moderator is not a fact other users need, and it makes them a target.
revoke select (is_moderator) on public.profiles from authenticated, anon;

create or replace function public.is_moderator()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select p.is_moderator from public.profiles p where p.id = (select auth.uid())),
    false)
$$;

revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

-- ---- resolution state ------------------------------------------------------
--
-- Reports are keyed per REPORTER, so three people reporting one message is
-- three rows. Resolution is a property of the CONTENT, so acting on it closes
-- every row for that content at once — otherwise the queue redisplays work
-- that is already done.

alter table public.comment_reports
  add column resolved_at  timestamptz,
  add column resolved_by  uuid references public.profiles (id) on delete set null,
  add column resolution   text check (resolution in ('dismissed', 'removed', 'banned'));

alter table public.message_reports
  add column resolved_at  timestamptz,
  add column resolved_by  uuid references public.profiles (id) on delete set null,
  add column resolution   text check (resolution in ('dismissed', 'removed', 'banned'));

create index comment_reports_open_idx on public.comment_reports (created_at)
  where resolved_at is null;
create index message_reports_open_idx on public.message_reports (created_at)
  where resolved_at is null;

-- ---- the audit trail -------------------------------------------------------
--
-- Append-only by construction: no UPDATE or DELETE is granted to anyone, so a
-- moderator cannot quietly rewrite what they did. If this ever needs to be
-- disputed, the record has to be the record.

create table public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),
  -- NULLABLE on purpose. `not null` with `on delete set null` is a
  -- contradiction that only fires later: deleting a moderator's account would
  -- fail the FK and take `delete_my_account` down with it. The trail outlives
  -- the account, and `moderation_log` left-joins the name for exactly this.
  moderator_id  uuid references public.profiles (id) on delete set null,
  action        text not null check (action in ('dismiss', 'remove', 'ban', 'unban')),
  target_kind   text not null check (target_kind in ('comment', 'message', 'user')),
  target_id     uuid not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  note          text check (note is null or char_length(note) <= 500),
  -- clock_timestamp(), NOT now(): now() is TRANSACTION START time, so two
  -- actions taken in one transaction get identical stamps and the log's
  -- order becomes arbitrary. An audit trail has to be able to say which
  -- happened first.
  created_at    timestamptz not null default clock_timestamp()
);

alter table public.moderation_actions enable row level security;
-- Definer-only, like banned_terms and rate_limits. Read access goes through
-- the queue RPC, which checks the role first.
revoke all on public.moderation_actions from public, anon, authenticated;

-- ---- the queue -------------------------------------------------------------

/**
 * Everything awaiting a decision, OLDEST first — the 24-hour clock starts at
 * the first report, so the most urgent work has to be at the top.
 *
 * Deliberately scoped to content that has ACTUALLY been reported. This is a
 * definer function reading other people's messages, so the reported set is the
 * entire justification for it existing — it must never become a way to browse
 * private conversations.
 */
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

   order by 9 asc;   -- oldest first: the 24-hour clock starts at first report
end;
$$;

revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- ---- acting on a report -----------------------------------------------------

/**
 * Resolve one piece of reported content.
 *
 * `p_action`:
 *   'dismiss' — the report was wrong; content stays, and an auto-hidden
 *               comment is UN-hidden, because three bad-faith reports should
 *               not be able to silence someone permanently.
 *   'remove'  — the content goes (soft-delete; realtime DELETE events bypass
 *               RLS, so nothing is ever hard-deleted here).
 *   'ban'     — remove the content AND ban the author.
 *
 * Closes every report row for that content, not just one, and writes the audit
 * row in the same transaction so an action can never exist without its record.
 */
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
  if p_kind not in ('comment', 'message') then
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
  else
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

/** Lift a ban. Separate from resolve_report: it targets a PERSON, not a report. */
create or replace function public.set_user_banned(
  p_user_id uuid,
  p_banned boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_mod uuid := (select auth.uid());
begin
  if not public.is_moderator() then
    raise exception 'not a moderator';
  end if;
  if p_user_id = v_mod then
    raise exception 'you cannot moderate yourself';
  end if;

  update public.profiles set banned = p_banned where id = p_user_id;
  if not found then raise exception 'no such person'; end if;

  insert into public.moderation_actions
    (moderator_id, action, target_kind, target_id, target_user_id, note)
  values (v_mod, case when p_banned then 'ban' else 'unban' end,
          'user', p_user_id, p_user_id, nullif(btrim(p_note), ''));
end;
$$;

revoke all on function public.set_user_banned(uuid, boolean, text) from public, anon;
grant execute on function public.set_user_banned(uuid, boolean, text) to authenticated;

/** The last N actions, so the trail is reviewable from inside the app. */
create or replace function public.moderation_log(p_limit integer default 50)
returns table (
  action text, target_kind text, target_id uuid,
  moderator_name text, target_name text, note text, created_at timestamptz
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
  select a.action, a.target_kind, a.target_id,
         m.display_name, t.display_name, a.note, a.created_at
    from public.moderation_actions a
    left join public.profiles m on m.id = a.moderator_id
    left join public.profiles t on t.id = a.target_user_id
   order by a.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

revoke all on function public.moderation_log(integer) from public, anon;
grant execute on function public.moderation_log(integer) to authenticated;

-- Discussion: per-title threads (group-scoped and public "takes"),
-- reactions, and the compliance kit (report / block / filter / ban / terms).
--
-- Design laws (researched 2026-07-14, see DESIGN.md "Reward loop law"):
--   * Reactions are POSITIVE-ONLY: like / funny / fire. No dislike.
--   * Public posting is GATED on having rated the title (Letterboxd shape).
--   * THE ONE RULE extends to words: a group's thread on a title is SEALED
--     per member while any session for that (group, title) is not open for
--     them (blind, or revealed with their card unlocked). Read AND write.
--   * Cred is peer-given (reactions received), group-scoped, computed on
--     read. No stored karma, no leaderboards.
--
-- Writes go through constrained SECURITY DEFINER RPCs only (post_comment /
-- delete_comment) so the filter, gating, and ban checks cannot be skipped.

-- ---- tables -----------------------------------------------------------------

create table public.title_comments (
  id          uuid primary key default gen_random_uuid(),
  title_id    uuid not null references public.titles (id) on delete cascade,
  -- null = the public per-title takes; set = one group's private thread
  group_id    uuid references public.groups (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  -- flattened threading: replies reference a TOP-LEVEL comment only
  parent_id   uuid references public.title_comments (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  -- author soft-delete: keeps replies hanging together under a placeholder
  deleted     boolean not null default false,
  -- three distinct reporters hide it pending review
  auto_hidden boolean not null default false,
  -- moderator removal (dashboard); invisible to everyone
  removed     boolean not null default false,
  constraint title_comments_body_len check (deleted or char_length(body) between 1 and 2000)
);
create index title_comments_thread_idx
  on public.title_comments (title_id, group_id, created_at desc);
create index title_comments_parent_idx on public.title_comments (parent_id);
create index title_comments_author_idx on public.title_comments (author_id);

create table public.comment_reactions (
  comment_id uuid not null references public.title_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('like', 'funny', 'fire')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.comment_reports (
  comment_id  uuid not null references public.title_comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text check (reason is null or char_length(reason) <= 500),
  created_at  timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

-- Service-managed wordlist (plain words only; matched with word boundaries).
-- No client grants: only the definer post RPC reads it.
create table public.banned_terms (term text primary key);

-- Moderation switches on the account itself. banned is flippable ONLY from
-- the dashboard (column-level update privilege below); accepted_terms_at is
-- stamped by the accept_discussion_terms RPC.
alter table public.profiles
  add column banned boolean not null default false,
  add column accepted_terms_at timestamptz;

-- ---- definer helpers --------------------------------------------------------

-- Sealed check: the group's thread on a title is open for me only when NO
-- session for that (group, title) is blind or revealed-but-unlocked-for-me.
create or replace function public.comments_open_for_me(p_title_id uuid, p_group_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select not exists (
    select 1 from public.reveal_sessions rs
    where rs.group_id = p_group_id
      and rs.title_id = p_title_id
      and not (rs.state = 'revealed' and public.has_locked_scorecard(rs.id))
  );
$$;

-- Public gating: you talk once you've rated (solo rating, or a locked card
-- in a revealed group session for this title).
create or replace function public.has_rated_title(p_title_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.global_ratings gr
    where gr.user_id = (select auth.uid()) and gr.title_id = p_title_id
  )
  or exists (
    select 1 from public.member_scores ms
    join public.reveal_sessions rs on rs.id = ms.session_id
    where ms.member_id = (select auth.uid())
      and ms.locked
      and rs.title_id = p_title_id
      and rs.state = 'revealed'
  );
$$;

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- ---- RLS --------------------------------------------------------------------

alter table public.title_comments enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.comment_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.banned_terms enable row level security;

create policy comments_select on public.title_comments
  for select to authenticated
  using (
    not removed
    and (author_id = (select auth.uid()) or not auto_hidden)
    and (author_id = (select auth.uid())
         or not public.is_blocked_pair((select auth.uid()), author_id))
    and (
      group_id is null
      or (public.is_group_member(group_id)
          and public.comments_open_for_me(title_id, group_id))
    )
  );
-- no insert/update/delete policies: writes exist only via the RPCs below

create policy reactions_select on public.comment_reactions
  for select to authenticated
  using (exists (select 1 from public.title_comments c where c.id = comment_id));
create policy reactions_insert_self on public.comment_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.title_comments c
      where c.id = comment_id and not c.deleted
    )
  );
create policy reactions_update_self on public.comment_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy reactions_delete_self on public.comment_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy reports_insert_self on public.comment_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.title_comments c where c.id = comment_id)
  );
create policy reports_select_self on public.comment_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy blocks_insert_self on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocks_select_self on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_delete_self on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- banned_terms: RLS on, no policies, no grants — definer-only.

-- ---- grants (explicit; platform defaults are never relied on) ---------------

grant select on public.title_comments to authenticated;
grant select, insert, update, delete on public.comment_reactions to authenticated;
grant select, insert on public.comment_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
-- belt and suspenders: hosted default privileges may add writes; RLS already
-- denies them (no policies), the revokes make it explicit.
revoke insert, update, delete on public.title_comments from authenticated;
revoke update, delete on public.comment_reports from authenticated;
revoke update on public.user_blocks from authenticated;
revoke all on public.banned_terms from authenticated, anon;

-- profiles.banned must never be self-serviced: narrow the update grant to
-- the one column users actually edit. (updateMyDisplayName only touches it.)
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---- write RPCs -------------------------------------------------------------

create or replace function public.accept_discussion_terms()
returns void language sql security definer set search_path = '' as $$
  update public.profiles
    set accepted_terms_at = now()
    where id = (select auth.uid()) and accepted_terms_at is null;
$$;
revoke execute on function public.accept_discussion_terms() from public;
grant execute on function public.accept_discussion_terms() to authenticated;

create or replace function public.post_comment(
  p_title_id uuid,
  p_group_id uuid,
  p_parent_id uuid,
  p_body text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile record;
  v_parent record;
  v_body text := trim(p_body);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select banned, accepted_terms_at into v_profile
    from public.profiles where id = v_uid;
  if v_profile.banned then
    raise exception 'posting is disabled for this account';
  end if;
  if v_profile.accepted_terms_at is null then
    raise exception 'accept the community terms first';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'comments must be 1 to 2000 characters';
  end if;
  -- the content filter: plain-word list, word-boundary match, case-blind
  if exists (
    select 1 from public.banned_terms t
    where v_body ~* ('\m' || t.term || '\M')
  ) then
    raise exception 'that comment contains language that is not allowed here';
  end if;

  if p_group_id is not null then
    if not public.is_group_member(p_group_id) then
      raise exception 'not a member of this group';
    end if;
    if not public.comments_open_for_me(p_title_id, p_group_id) then
      raise exception 'this thread is sealed until you lock your scorecard';
    end if;
  else
    if not public.has_rated_title(p_title_id) then
      raise exception 'rate this title first to join the discussion';
    end if;
  end if;

  if p_parent_id is not null then
    select title_id, group_id, parent_id, deleted, removed into v_parent
      from public.title_comments where id = p_parent_id;
    if v_parent is null or v_parent.deleted or v_parent.removed then
      raise exception 'that comment is gone';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'replies go one level deep';
    end if;
    if v_parent.title_id is distinct from p_title_id
       or v_parent.group_id is distinct from p_group_id then
      raise exception 'reply does not match the thread';
    end if;
  end if;

  insert into public.title_comments (title_id, group_id, author_id, parent_id, body)
  values (p_title_id, p_group_id, v_uid, p_parent_id, v_body)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.post_comment(uuid, uuid, uuid, text) from public;
grant execute on function public.post_comment(uuid, uuid, uuid, text) to authenticated;

-- Author soft-delete: the row stays (replies keep their anchor), the words go.
create or replace function public.delete_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.title_comments
    set deleted = true, body = ''
    where id = p_comment_id
      and author_id = (select auth.uid())
      and not deleted;
  if not found then
    raise exception 'not your comment';
  end if;
end;
$$;
revoke execute on function public.delete_comment(uuid) from public;
grant execute on function public.delete_comment(uuid) to authenticated;

-- ---- report threshold -------------------------------------------------------

-- Three distinct reporters hide a comment pending review: the "timely
-- response" is structural, not a promise.
create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.comment_reports
        where comment_id = new.comment_id) >= 3 then
    update public.title_comments
      set auto_hidden = true
      where id = new.comment_id and not auto_hidden;
  end if;
  return new;
end;
$$;
create trigger on_comment_report_threshold
  after insert on public.comment_reports
  for each row execute function public.auto_hide_reported();

-- ---- cred (peer-given, group-scoped, computed on read) ----------------------

create or replace function public.group_cred(p_group_id uuid)
returns table (user_id uuid, cred bigint)
language sql security definer set search_path = '' stable as $$
  select c.author_id, count(*)::bigint
  from public.title_comments c
  join public.comment_reactions r on r.comment_id = c.id
  where c.group_id = p_group_id
    and not c.deleted and not c.removed
    and public.is_group_member(p_group_id)
  group by c.author_id;
$$;
revoke execute on function public.group_cred(uuid) from public;
grant execute on function public.group_cred(uuid) to authenticated;

-- One call for the client to know how a scope stands for the viewer.
create or replace function public.discussion_gate(p_title_id uuid, p_group_id uuid)
returns table (open_for_me boolean, rated boolean, terms_accepted boolean)
language sql security definer set search_path = '' stable as $$
  select
    case when p_group_id is null then true
         else public.is_group_member(p_group_id)
              and public.comments_open_for_me(p_title_id, p_group_id) end,
    public.has_rated_title(p_title_id),
    exists (select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.accepted_terms_at is not null);
$$;
revoke execute on function public.discussion_gate(uuid, uuid) from public;
grant execute on function public.discussion_gate(uuid, uuid) to authenticated;

-- ---- push: a reply notifies the parent comment's author ---------------------

create or replace function public.notify_comment_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent_author uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select author_id into v_parent_author
    from public.title_comments where id = new.parent_id;
  if v_parent_author is null or v_parent_author = new.author_id then
    return new;
  end if;
  perform public.push_notify(jsonb_build_object(
    'event', 'comment_reply',
    'comment_id', new.id,
    'title_id', new.title_id,
    'group_id', new.group_id,
    'recipient_id', v_parent_author,
    'actor_id', new.author_id));
  return new;
end;
$$;
create trigger on_comment_reply_notify
  after insert on public.title_comments
  for each row execute function public.notify_comment_reply();

-- ---- realtime ---------------------------------------------------------------

alter publication supabase_realtime add table public.title_comments;

-- ---- starter wordlist (plain words; extend from the dashboard) ---------------

-- Unambiguous slurs and abuse only: words that carry legitimate film-talk
-- meaning (violence, crime, dialogue quotes) stay OUT of the list so real
-- discussion of hard films is never blocked.
insert into public.banned_terms (term) values
  ('nigger'), ('nigga'), ('faggot'), ('kike'), ('spic'), ('chink'),
  ('wetback'), ('tranny'), ('kys')
on conflict do nothing;

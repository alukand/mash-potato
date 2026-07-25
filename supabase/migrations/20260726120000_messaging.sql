-- Messaging: 1:1 DMs (request/accept for strangers), a built-in chat for
-- every group, and custom chats. Plus reactions, replies, share cards, read
-- state, mute/archive, search, and the moderation kit.
--
-- Design laws (decided 2026-07-26, see DESIGN.md "Messaging"):
--   * ONE membership helper, three container kinds. is_conversation_member()
--     takes NO user id — it reads auth.uid() itself, exactly like
--     is_group_member. Adding a p_user_id argument would turn a
--     SECURITY DEFINER function into a membership ORACLE any signed-in user
--     could query about any conversation. Never add one.
--   * A 'group' conversation has NO roster of its own: membership IS
--     group_members. Nothing to sync, ever; leaving the group leaves the chat
--     on the next statement.
--   * Two people can never hold two DM threads: dm_key is a generated column
--     over the SORTED uuid pair with a unique index.
--   * A DECLINE IS INVISIBLE. Declining writes a tombstone the requester
--     cannot read, and their next send fails with the SAME string as being
--     blocked — so neither the error nor the UI is an oracle for "they
--     declined you". Ghosting is the product.
--   * Blocking STOPS a DM (checked in send_message), but in group and custom
--     chats it can only HIDE — both people are legitimately in the room. The
--     UI must say the right one; see DESIGN.md.
--   * Writes go through constrained SECURITY DEFINER RPCs only, so the ban
--     switch, terms gate, wordlist, and scope checks cannot be skipped.
--     Every table below has SELECT policies and nothing else.
--
-- REALTIME IS THE PRIVACY BOUNDARY HERE (not a convenience as it is for
-- comments). Two consequences are permanent:
--   * DELETE events BYPASS RLS. Postgres ships only replica-identity columns
--     on delete and Realtime cannot evaluate a policy against them, so every
--     subscriber to a published table receives every delete. Therefore
--     messages are SOFT-deleted only, and conversation_participants is
--     deliberately NOT in the publication (leave_chat deletes rows, which
--     would broadcast the roster). Roster changes surface as a 'system'
--     message instead.
--   * REPLICA IDENTITY FULL must never be set on public.messages — it would
--     put the full old body in the WAL for Realtime to forward.

-- ---- tables -----------------------------------------------------------------

-- Three container kinds behind one id.
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('dm', 'group', 'custom')),
  -- set = the built-in chat for that group; membership is group_members
  group_id        uuid references public.groups (id) on delete cascade,
  title           text check (title is null or char_length(title) between 1 and 80),
  -- a DM's two uuid columns ARE its roster. Cascade: a DM is jointly owned,
  -- so it goes when either party deletes their account.
  dm_user_a       uuid references public.profiles (id) on delete cascade,
  dm_user_b       uuid references public.profiles (id) on delete cascade,
  dm_key          text generated always as (
                    case
                      when kind <> 'dm' then null
                      when dm_user_a < dm_user_b
                        then dm_user_a::text || ':' || dm_user_b::text
                      else dm_user_b::text || ':' || dm_user_a::text
                    end
                  ) stored,
  request_state   text not null default 'accepted'
                    check (request_state in ('pending', 'accepted')),
  requested_by    uuid references public.profiles (id) on delete cascade,
  accepted_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_shape check (
    case kind
      when 'dm' then group_id is null and title is null
                   and dm_user_a is not null and dm_user_b is not null
                   and dm_user_a <> dm_user_b
      when 'group' then group_id is not null and title is null
                   and dm_user_a is null and dm_user_b is null
                   and request_state = 'accepted'
      when 'custom' then group_id is null and title is not null
                   and dm_user_a is null and dm_user_b is null
                   and request_state = 'accepted'
    end
  ),
  constraint conversations_requester check (
    requested_by is null
    or (kind = 'dm' and (requested_by = dm_user_a or requested_by = dm_user_b))
  ),
  constraint conversations_pending_is_dm check (
    request_state = 'accepted' or (kind = 'dm' and requested_by is not null)
  )
);

-- Two users can never end up with two DM threads. dm_key is null for the
-- other kinds and nulls are distinct, so this constrains DM rows only.
create unique index conversations_dm_key_uidx on public.conversations (dm_key);
create unique index conversations_group_uidx
  on public.conversations (group_id) where kind = 'group';
create index conversations_activity_idx on public.conversations (last_message_at desc);
create index conversations_dm_a_idx on public.conversations (dm_user_a);
create index conversations_dm_b_idx on public.conversations (dm_user_b);
create index conversations_requested_by_idx
  on public.conversations (requested_by) where request_state = 'pending';

-- Custom-chat roster ONLY. Never written for 'dm' or 'group'. Carries no
-- per-user preferences, so it stays member-readable without leaking who
-- muted whom (that lives in conversation_state).
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  added_by        uuid references public.profiles (id) on delete set null,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx
  on public.conversation_participants (user_id);

-- Per-user read watermark + mute + archive, lazily upserted for EVERY
-- conversation kind (group chats have no participant row). Self-only:
-- "X muted this chat" must never be readable by X's chat.
create table public.conversation_state (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  last_read_at    timestamptz not null default '-infinity',
  muted           boolean not null default false,
  archived        boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
create index conversation_state_conv_idx on public.conversation_state (conversation_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  kind            text not null default 'text'
                    check (kind in ('text', 'title', 'playlist', 'system')),
  body            text not null default '',
  -- share cards: the id renders live; share_label is the snapshot so the card
  -- still reads if the playlist is later deleted or unpublished
  share_title_id    uuid references public.titles (id) on delete restrict,
  share_playlist_id uuid references public.playlists (id) on delete set null,
  share_label     text check (share_label is null or char_length(share_label) <= 120),
  reply_to_id     uuid references public.messages (id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted         boolean not null default false,  -- author soft-delete
  auto_hidden     boolean not null default false,  -- report threshold
  removed         boolean not null default false,  -- dashboard moderation
  search tsvector generated always as (
    to_tsvector('english', coalesce(body, '') || ' ' || coalesce(share_label, ''))
  ) stored,
  -- `deleted or` escape: delete_message blanks the body and the share
  -- columns, which a naive shape check would reject.
  constraint messages_shape check (
    deleted or (
      case kind
        when 'text' then share_title_id is null and share_playlist_id is null
                       and char_length(body) between 1 and 4000
        when 'title' then share_title_id is not null and share_playlist_id is null
                       and char_length(body) <= 4000
        when 'playlist' then share_playlist_id is not null and share_title_id is null
                       and char_length(body) <= 4000
        when 'system' then share_title_id is null and share_playlist_id is null
                       and char_length(body) between 1 and 400
      end
    )
  ),
  -- lets reactions/reports carry conversation_id via a composite FK, so their
  -- RLS is one helper call and a row can never attach to the wrong thread
  unique (id, conversation_id)
);
create index messages_thread_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id);
create index messages_reply_idx on public.messages (reply_to_id) where reply_to_id is not null;
create index messages_search_idx on public.messages using gin (search);

create table public.message_reactions (
  message_id      uuid not null,
  conversation_id uuid not null,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('like', 'funny', 'fire', 'love', 'sad')),
  created_at      timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade
);
create index message_reactions_user_idx on public.message_reactions (user_id);
create index message_reactions_conv_idx on public.message_reactions (conversation_id);

create table public.message_reports (
  message_id      uuid not null,
  conversation_id uuid not null,
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  reason          text check (reason is null or char_length(reason) <= 500),
  created_at      timestamptz not null default now(),
  primary key (message_id, reporter_id),
  foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade
);
create index message_reports_message_idx on public.message_reports (message_id);

-- A decline is never a visible state change on the conversation: the
-- requester keeps seeing their own unanswered message, indistinguishable
-- from being ignored. Only the recipient can read their own tombstones.
create table public.dm_request_declines (
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (recipient_id, requester_id),
  constraint dm_request_declines_not_self check (recipient_id <> requester_id)
);
create index dm_request_declines_requester_idx
  on public.dm_request_declines (requester_id);

-- ---- helpers ----------------------------------------------------------------

-- THE membership helper. Three structural branches, no roster sync anywhere.
-- SECURITY DEFINER is required, not incidental: the policy on conversations
-- calls this and this reads conversations, so an invoker-rights version would
-- recurse into its own policy (same reason is_group_member is definer).
-- It takes NO user id — see the law in the header.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and case c.kind
            when 'dm' then c.dm_user_a = (select auth.uid())
                        or c.dm_user_b = (select auth.uid())
            when 'group' then public.is_group_member(c.group_id)
            else exists (
              select 1 from public.conversation_participants p
              where p.conversation_id = c.id
                and p.user_id = (select auth.uid()))
          end
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- INTERNAL: deliberately NOT granted to authenticated. A requester must not
-- be able to probe whether they were declined.
create or replace function public.dm_request_declined(p_conversation_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.conversations c
    join public.dm_request_declines d
      on d.requester_id = c.requested_by
     and d.recipient_id = case when c.requested_by = c.dm_user_a
                               then c.dm_user_b else c.dm_user_a end
    where c.id = p_conversation_id
      and c.kind = 'dm'
      and d.recipient_id = (select auth.uid())
  );
$$;
revoke all on function public.dm_request_declined(uuid) from public, anon, authenticated;

-- Membership AND the decline gate, folded together so a policy makes one
-- definer call per row.
create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select public.is_conversation_member(p_conversation_id)
     and not public.dm_request_declined(p_conversation_id);
$$;
revoke all on function public.can_read_conversation(uuid) from public, anon;
grant execute on function public.can_read_conversation(uuid) to authenticated;

-- The server-side twin of fetchMyFriends (which is client-side, so forgeable).
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select p_user_id is not null
     and p_user_id <> (select auth.uid())
     and exists (
       select 1
       from public.group_members a
       join public.group_members b on b.group_id = a.group_id
       where a.user_id = (select auth.uid())
         and b.user_id = p_user_id
     );
$$;
revoke all on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- "May I open a real conversation with this person without a request?"
-- Groupmate, or we already have an accepted DM. Blocking overrides both.
-- THIS PREDICATE IS THE WHOLE ANTI-HARASSMENT STORY for custom chats: loosen
-- it there and a stranger regains the ability to put content in front of
-- anyone by dragging them into a room.
create or replace function public.can_message_directly(p_user_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select p_user_id is not null
     and p_user_id <> (select auth.uid())
     and not public.is_blocked_pair((select auth.uid()), p_user_id)
     and (
       public.shares_group_with(p_user_id)
       or exists (
         select 1 from public.conversations c
         where c.kind = 'dm' and c.request_state = 'accepted'
           and c.dm_key = case
                 when (select auth.uid()) < p_user_id
                   then (select auth.uid())::text || ':' || p_user_id::text
                 else p_user_id::text || ':' || (select auth.uid())::text end
       )
     );
$$;
revoke all on function public.can_message_directly(uuid) from public, anon;
grant execute on function public.can_message_directly(uuid) to authenticated;

-- The "new message" picker roster, server-side (replaces two client queries).
create or replace function public.my_groupmates()
returns table (user_id uuid, display_name text, avatar_key text, shared_groups text[])
language sql security definer set search_path = '' stable as $$
  select b.user_id, pr.display_name, pr.avatar_key,
         array_agg(g.name order by g.name)
  from public.group_members a
  join public.group_members b on b.group_id = a.group_id and b.user_id <> a.user_id
  join public.groups g on g.id = a.group_id
  join public.profiles pr on pr.id = b.user_id
  where a.user_id = (select auth.uid())
    and not public.is_blocked_pair((select auth.uid()), b.user_id)
  group by b.user_id, pr.display_name, pr.avatar_key;
$$;
revoke all on function public.my_groupmates() from public, anon;
grant execute on function public.my_groupmates() to authenticated;

-- ---- RLS --------------------------------------------------------------------

alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_state        enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_reactions         enable row level security;
alter table public.message_reports           enable row level security;
alter table public.dm_request_declines       enable row level security;

create policy conversations_select_member on public.conversations
  for select to authenticated
  using (public.can_read_conversation(id));

create policy participants_select_member on public.conversation_participants
  for select to authenticated
  using (public.can_read_conversation(conversation_id));

create policy conversation_state_select_self on public.conversation_state
  for select to authenticated
  using (user_id = (select auth.uid()));

-- This predicate is ALSO what Realtime evaluates per subscriber, per event.
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    not removed
    and (sender_id = (select auth.uid()) or not auto_hidden)
    and (sender_id = (select auth.uid())
         or not public.is_blocked_pair((select auth.uid()), sender_id))
    and public.can_read_conversation(conversation_id)
  );

create policy message_reactions_select_member on public.message_reactions
  for select to authenticated
  using (public.can_read_conversation(conversation_id));

create policy message_reports_select_self on public.message_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

-- The decliner sees their own tombstones. There is deliberately NO policy
-- that can return the row to the requester.
create policy dm_request_declines_select_self on public.dm_request_declines
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- no insert/update/delete policies on ANY table above: writes are RPCs only

-- ---- grants -----------------------------------------------------------------

grant select on public.conversations             to authenticated;
grant select on public.conversation_participants to authenticated;
grant select on public.conversation_state        to authenticated;
grant select on public.messages                  to authenticated;
grant select on public.message_reactions         to authenticated;
grant select on public.message_reports           to authenticated;
grant select on public.dm_request_declines       to authenticated;

-- Hosted default privileges may add writes; RLS already denies them (no
-- policies), and these make it explicit so a `db push` cannot drift.
revoke insert, update, delete on public.conversations             from authenticated, anon;
revoke insert, update, delete on public.conversation_participants from authenticated, anon;
revoke insert, update, delete on public.conversation_state        from authenticated, anon;
revoke insert, update, delete on public.messages                  from authenticated, anon;
revoke insert, update, delete on public.message_reactions         from authenticated, anon;
revoke insert, update, delete on public.message_reports           from authenticated, anon;
revoke insert, update, delete on public.dm_request_declines       from authenticated, anon;
revoke all on public.conversations             from anon;
revoke all on public.conversation_participants from anon;
revoke all on public.conversation_state        from anon;
revoke all on public.messages                  from anon;
revoke all on public.message_reactions         from anon;
revoke all on public.message_reports           from anon;
revoke all on public.dm_request_declines       from anon;

-- ---- write RPCs -------------------------------------------------------------

-- Get-or-create a DM. Groupmates land 'accepted'; strangers land 'pending'.
-- Idempotent via the dm_key unique index, so two taps cannot make two threads.
create or replace function public.start_dm(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile record;
  v_id uuid;
  v_key text;
  v_pending int;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'pick someone else';
  end if;
  select banned, accepted_terms_at into v_profile
    from public.profiles where id = v_uid;
  if v_profile is null then
    raise exception 'not signed in';
  end if;
  if v_profile.banned then
    raise exception 'messaging is disabled for this account';
  end if;
  if v_profile.accepted_terms_at is null then
    raise exception 'accept the community terms first';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'that account is gone';
  end if;
  -- blocking, and a decline, both fail with the SAME message: neither can be
  -- used to work out which one happened.
  if public.is_blocked_pair(v_uid, p_user_id) then
    raise exception 'this conversation is not open';
  end if;
  if exists (select 1 from public.dm_request_declines d
             where d.recipient_id = p_user_id and d.requester_id = v_uid) then
    raise exception 'this conversation is not open';
  end if;

  v_key := case when v_uid < p_user_id
                then v_uid::text || ':' || p_user_id::text
                else p_user_id::text || ':' || v_uid::text end;

  select id into v_id from public.conversations where dm_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  -- rate cap on unanswered requests. Not a hard limit (now() is per-tx, so a
  -- race can land 11) — it bounds a mass-DM run, nothing more.
  if not public.shares_group_with(p_user_id) then
    select count(*) into v_pending from public.conversations
      where requested_by = v_uid and request_state = 'pending'
        and created_at > now() - interval '24 hours';
    if v_pending >= 10 then
      raise exception 'too many message requests today';
    end if;
  end if;

  insert into public.conversations
    (kind, dm_user_a, dm_user_b, created_by, requested_by, request_state, accepted_at)
  values
    ('dm', v_uid, p_user_id, v_uid, v_uid,
     case when public.shares_group_with(p_user_id) then 'accepted' else 'pending' end,
     case when public.shares_group_with(p_user_id) then now() else null end)
  on conflict (dm_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversations where dm_key = v_key;
  end if;
  return v_id;
end;
$$;
revoke all on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;

-- The validation ladder mirrors post_comment exactly:
-- signed-in -> banned -> terms -> length -> wordlist -> scope -> parent.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_reply_to_id uuid default null,
  p_kind text default 'text',
  p_title_id uuid default null,
  p_playlist_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile record;
  v_conv record;
  v_parent record;
  v_other uuid;
  v_body text := coalesce(trim(p_body), '');
  v_label text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select banned, accepted_terms_at into v_profile
    from public.profiles where id = v_uid;
  if v_profile.banned then
    raise exception 'messaging is disabled for this account';
  end if;
  if v_profile.accepted_terms_at is null then
    raise exception 'accept the community terms first';
  end if;

  if p_kind is null or p_kind not in ('text', 'title', 'playlist') then
    raise exception 'unsupported message type';
  end if;
  if p_kind = 'text' and (char_length(v_body) < 1 or char_length(v_body) > 4000) then
    raise exception 'messages must be 1 to 4000 characters';
  end if;
  if p_kind <> 'text' and char_length(v_body) > 4000 then
    raise exception 'messages must be 1 to 4000 characters';
  end if;

  if v_body <> '' and exists (
    select 1 from public.banned_terms t
    where v_body ~* ('\m' || t.term || '\M')
  ) then
    raise exception 'that message contains language that is not allowed here';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'this conversation is not open';
  end if;

  if v_conv.kind = 'dm' then
    v_other := case when v_conv.dm_user_a = v_uid
                    then v_conv.dm_user_b else v_conv.dm_user_a end;
    -- BLOCKING STOPS THE MESSAGE here, in both directions. (In group and
    -- custom chats it can only hide — both people belong in the room.)
    if public.is_blocked_pair(v_uid, v_other) then
      raise exception 'this conversation is not open';
    end if;
    if exists (select 1 from public.dm_request_declines d
               where d.recipient_id = v_other and d.requester_id = v_uid) then
      raise exception 'this conversation is not open';
    end if;
    if v_conv.request_state = 'pending' then
      if v_uid = v_conv.requested_by then
        -- exactly ONE message before acceptance
        if exists (select 1 from public.messages m
                   where m.conversation_id = v_conv.id and m.sender_id = v_uid) then
          raise exception 'wait for them to accept before sending more';
        end if;
      else
        -- the recipient replying IS the acceptance
        update public.conversations
           set request_state = 'accepted', accepted_at = now()
         where id = v_conv.id;
      end if;
    end if;
  end if;

  -- share cards: snapshot the label, and refuse to point at something the
  -- readers could not open
  if p_kind = 'title' then
    select t.name into v_label from public.titles t where t.id = p_title_id;
    if v_label is null then
      raise exception 'that title is gone';
    end if;
  elsif p_kind = 'playlist' then
    select pl.name into v_label from public.playlists pl
     where pl.id = p_playlist_id
       and (pl.is_public
            or (pl.group_id is not null and pl.group_id = v_conv.group_id));
    if v_label is null then
      raise exception 'make this playlist public before sharing it';
    end if;
  end if;

  if p_reply_to_id is not null then
    select conversation_id, deleted, removed into v_parent
      from public.messages where id = p_reply_to_id;
    if v_parent is null or v_parent.deleted or v_parent.removed then
      raise exception 'that message is gone';
    end if;
    if v_parent.conversation_id is distinct from p_conversation_id then
      raise exception 'reply does not match the conversation';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body,
                               share_title_id, share_playlist_id, share_label,
                               reply_to_id)
  values (p_conversation_id, v_uid, p_kind, v_body,
          p_title_id, p_playlist_id, v_label, p_reply_to_id)
  returning id into v_id;

  -- sending marks your own side read
  insert into public.conversation_state (user_id, conversation_id, last_read_at)
  values (v_uid, p_conversation_id, now())
  on conflict (user_id, conversation_id)
    do update set last_read_at = now(), updated_at = now();

  return v_id;
end;
$$;
revoke all on function public.send_message(uuid, text, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, text, uuid, uuid) to authenticated;

create or replace function public.accept_dm_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv record;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_conv from public.conversations
   where id = p_conversation_id and kind = 'dm';
  if v_conv.id is null or (v_conv.dm_user_a <> v_uid and v_conv.dm_user_b <> v_uid) then
    raise exception 'this conversation is not open';
  end if;
  if v_conv.requested_by = v_uid then
    raise exception 'they have not answered yet';
  end if;
  v_other := case when v_conv.dm_user_a = v_uid
                  then v_conv.dm_user_b else v_conv.dm_user_a end;
  if public.is_blocked_pair(v_uid, v_other) then
    raise exception 'this conversation is not open';
  end if;
  delete from public.dm_request_declines
   where recipient_id = v_uid and requester_id = v_other;
  update public.conversations
     set request_state = 'accepted', accepted_at = now()
   where id = p_conversation_id;
end;
$$;
revoke all on function public.accept_dm_request(uuid) from public, anon;
grant execute on function public.accept_dm_request(uuid) to authenticated;

-- Writes the tombstone. Deliberately does NOT delete the conversation (that
-- would let the sender re-request immediately) and does NOT flip a visible
-- flag (that would leak the decline).
create or replace function public.decline_dm_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv record;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_conv from public.conversations
   where id = p_conversation_id and kind = 'dm';
  if v_conv.id is null or (v_conv.dm_user_a <> v_uid and v_conv.dm_user_b <> v_uid) then
    raise exception 'this conversation is not open';
  end if;
  if v_conv.requested_by = v_uid then
    raise exception 'they have not answered yet';
  end if;
  insert into public.dm_request_declines (recipient_id, requester_id)
  values (v_uid, v_conv.requested_by)
  on conflict do nothing;
end;
$$;
revoke all on function public.decline_dm_request(uuid) from public, anon;
grant execute on function public.decline_dm_request(uuid) to authenticated;

create or replace function public.create_group_chat(p_title text, p_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile record;
  v_title text := coalesce(trim(p_title), '');
  v_ids uuid[];
  v_target uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select banned, accepted_terms_at into v_profile from public.profiles where id = v_uid;
  if v_profile.banned then
    raise exception 'messaging is disabled for this account';
  end if;
  if v_profile.accepted_terms_at is null then
    raise exception 'accept the community terms first';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'name the chat, up to 80 characters';
  end if;
  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as x where x <> v_uid;
  if v_ids is null or array_length(v_ids, 1) < 1 then
    raise exception 'add at least one other person';
  end if;
  if array_length(v_ids, 1) > 49 then
    raise exception 'a chat holds 50 people';
  end if;
  -- the request gate, enforced per invitee: without this a stranger could
  -- drag anyone into a room and bypass it entirely
  foreach v_target in array v_ids loop
    if not public.can_message_directly(v_target) then
      raise exception 'you can only add people you already share a group or a chat with';
    end if;
  end loop;

  insert into public.conversations (kind, title, created_by)
  values ('custom', v_title, v_uid) returning id into v_id;

  insert into public.conversation_participants (conversation_id, user_id, role, added_by)
  values (v_id, v_uid, 'owner', v_uid);
  insert into public.conversation_participants (conversation_id, user_id, role, added_by)
  select v_id, x, 'member', v_uid from unnest(v_ids) as x;

  return v_id;
end;
$$;
revoke all on function public.create_group_chat(text, uuid[]) from public, anon;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

create or replace function public.add_chat_participants(
  p_conversation_id uuid, p_user_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv record;
  v_ids uuid[];
  v_target uuid;
  v_count int;
  v_names text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_conv from public.conversations
   where id = p_conversation_id and kind = 'custom';
  if v_conv.id is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'this conversation is not open';
  end if;
  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as x
   where not exists (select 1 from public.conversation_participants p
                     where p.conversation_id = p_conversation_id and p.user_id = x);
  if v_ids is null or array_length(v_ids, 1) < 1 then
    return;
  end if;
  select count(*) into v_count from public.conversation_participants
   where conversation_id = p_conversation_id;
  if v_count + array_length(v_ids, 1) > 50 then
    raise exception 'a chat holds 50 people';
  end if;
  foreach v_target in array v_ids loop
    if not public.can_message_directly(v_target) then
      raise exception 'you can only add people you already share a group or a chat with';
    end if;
  end loop;

  insert into public.conversation_participants (conversation_id, user_id, added_by)
  select p_conversation_id, x, v_uid from unnest(v_ids) as x;

  -- roster changes surface as a message, because the roster table is kept
  -- OUT of the realtime publication (delete events bypass RLS)
  select string_agg(pr.display_name, ', ' order by pr.display_name) into v_names
    from public.profiles pr where pr.id = any(v_ids);
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (p_conversation_id, v_uid, 'system',
          left(coalesce(v_names, 'Someone') || ' joined the chat', 400));
end;
$$;
revoke all on function public.add_chat_participants(uuid, uuid[]) from public, anon;
grant execute on function public.add_chat_participants(uuid, uuid[]) to authenticated;

create or replace function public.leave_chat(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv record;
  v_was_owner boolean;
  v_heir uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null then
    raise exception 'this conversation is not open';
  end if;
  if v_conv.kind <> 'custom' then
    -- group chats follow the group; DMs are archived or blocked, not left
    raise exception 'this chat cannot be left';
  end if;
  select (role = 'owner') into v_was_owner from public.conversation_participants
   where conversation_id = p_conversation_id and user_id = v_uid;
  if v_was_owner is null then
    raise exception 'this conversation is not open';
  end if;

  select display_name into v_name from public.profiles where id = v_uid;
  delete from public.conversation_participants
   where conversation_id = p_conversation_id and user_id = v_uid;

  select p.user_id into v_heir from public.conversation_participants p
   where p.conversation_id = p_conversation_id
   order by p.joined_at asc, p.user_id asc limit 1;

  if v_heir is null then
    delete from public.conversations where id = p_conversation_id;
    return;
  end if;
  if v_was_owner and not exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = p_conversation_id and p.role = 'owner') then
    update public.conversation_participants set role = 'owner'
     where conversation_id = p_conversation_id and user_id = v_heir;
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body)
  values (p_conversation_id, v_heir, 'system',
          left(coalesce(v_name, 'Someone') || ' left the chat', 400));
end;
$$;
revoke all on function public.leave_chat(uuid) from public, anon;
grant execute on function public.leave_chat(uuid) to authenticated;

create or replace function public.rename_chat(p_conversation_id uuid, p_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text := coalesce(trim(p_title), '');
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'name the chat, up to 80 characters';
  end if;
  if not exists (
    select 1 from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.conversation_id = p_conversation_id and p.user_id = v_uid
      and p.role = 'owner' and c.kind = 'custom') then
    raise exception 'only the chat owner can rename it';
  end if;
  update public.conversations set title = v_title where id = p_conversation_id;
end;
$$;
revoke all on function public.rename_chat(uuid, text) from public, anon;
grant execute on function public.rename_chat(uuid, text) to authenticated;

-- Soft delete, mirroring delete_comment: the row stays so replies keep their
-- anchor, and the generated tsvector recomputes to empty so the text leaves
-- search too.
create or replace function public.delete_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.messages
     set deleted = true, body = '', share_title_id = null,
         share_playlist_id = null, share_label = null
   where id = p_message_id
     and sender_id = (select auth.uid())
     and not deleted;
  if not found then
    raise exception 'not your message';
  end if;
end;
$$;
revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

create or replace function public.toggle_message_reaction(p_message_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_msg record;
  v_existing text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_kind not in ('like', 'funny', 'fire', 'love', 'sad') then
    raise exception 'unknown reaction';
  end if;
  select id, conversation_id, sender_id, deleted, removed into v_msg
    from public.messages where id = p_message_id;
  if v_msg.id is null or v_msg.deleted or v_msg.removed then
    raise exception 'that message is gone';
  end if;
  if not public.is_conversation_member(v_msg.conversation_id) then
    raise exception 'this conversation is not open';
  end if;
  if public.is_blocked_pair(v_uid, v_msg.sender_id) then
    raise exception 'that message is gone';
  end if;

  select kind into v_existing from public.message_reactions
   where message_id = p_message_id and user_id = v_uid;
  if v_existing = p_kind then
    delete from public.message_reactions
     where message_id = p_message_id and user_id = v_uid;
  else
    insert into public.message_reactions (message_id, conversation_id, user_id, kind)
    values (p_message_id, v_msg.conversation_id, v_uid, p_kind)
    on conflict (message_id, user_id) do update set kind = excluded.kind;
  end if;
end;
$$;
revoke all on function public.toggle_message_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

create or replace function public.report_message(p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_msg record;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select id, conversation_id, sender_id into v_msg
    from public.messages where id = p_message_id;
  if v_msg.id is null then
    raise exception 'that message is gone';
  end if;
  if v_msg.sender_id = v_uid then
    raise exception 'you cannot report your own message';
  end if;
  if not public.is_conversation_member(v_msg.conversation_id) then
    raise exception 'this conversation is not open';
  end if;
  insert into public.message_reports (message_id, conversation_id, reporter_id, reason)
  values (p_message_id, v_msg.conversation_id, v_uid,
          nullif(left(coalesce(trim(p_reason), ''), 500), ''))
  on conflict do nothing;
end;
$$;
revoke all on function public.report_message(uuid, text) from public, anon;
grant execute on function public.report_message(uuid, text) to authenticated;

-- greatest(): an out-of-order call cannot walk the watermark backwards.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not public.can_read_conversation(p_conversation_id) then
    raise exception 'this conversation is not open';
  end if;
  insert into public.conversation_state (user_id, conversation_id, last_read_at)
  values (v_uid, p_conversation_id, now())
  on conflict (user_id, conversation_id) do update
    set last_read_at = greatest(public.conversation_state.last_read_at, now()),
        updated_at = now();
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.set_conversation_prefs(
  p_conversation_id uuid, p_muted boolean default null, p_archived boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not public.can_read_conversation(p_conversation_id) then
    raise exception 'this conversation is not open';
  end if;
  insert into public.conversation_state
    (user_id, conversation_id, muted, archived)
  values (v_uid, p_conversation_id, coalesce(p_muted, false), coalesce(p_archived, false))
  on conflict (user_id, conversation_id) do update
    set muted = coalesce(p_muted, public.conversation_state.muted),
        archived = coalesce(p_archived, public.conversation_state.archived),
        updated_at = now();
end;
$$;
revoke all on function public.set_conversation_prefs(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_conversation_prefs(uuid, boolean, boolean) to authenticated;

-- Blocking implies declining any pending request from them.
create or replace function public.block_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'pick someone else';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id) on conflict do nothing;
  insert into public.dm_request_declines (recipient_id, requester_id)
  select v_uid, p_user_id
   where exists (select 1 from public.conversations c
                 where c.kind = 'dm' and c.request_state = 'pending'
                   and c.requested_by = p_user_id
                   and (c.dm_user_a = v_uid or c.dm_user_b = v_uid))
  on conflict do nothing;
end;
$$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- The missing piece: user_blocks always had a delete policy and no client
-- path. Unblocking restores visibility, NOT consent — the decline tombstone
-- deliberately survives.
create or replace function public.unblock_user(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.user_blocks
   where blocker_id = (select auth.uid()) and blocked_id = p_user_id;
$$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.my_blocks()
returns table (user_id uuid, display_name text, avatar_key text, created_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select b.blocked_id, pr.display_name, pr.avatar_key, b.created_at
  from public.user_blocks b
  join public.profiles pr on pr.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by pr.display_name;
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- Backstop for any group whose chat is missing (pre-trigger rows, or a
-- future path that skips it).
create or replace function public.group_conversation(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group';
  end if;
  select id into v_id from public.conversations
   where group_id = p_group_id and kind = 'group';
  if v_id is not null then
    return v_id;
  end if;
  insert into public.conversations (kind, group_id, created_by)
  values ('group', p_group_id, (select auth.uid()))
  on conflict (group_id) where kind = 'group' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations
     where group_id = p_group_id and kind = 'group';
  end if;
  return v_id;
end;
$$;
revoke all on function public.group_conversation(uuid) from public, anon;
grant execute on function public.group_conversation(uuid) to authenticated;

-- ---- read RPCs --------------------------------------------------------------

-- One round trip for the whole inbox: two bounded index scans per
-- conversation on messages_thread_idx, no N+1.
--
-- CAUTION: this is SECURITY DEFINER and therefore RE-STATES the visibility
-- rule that messages_select_member owns. If that policy changes and these
-- CTEs do not, previews and unread counts will leak a blocked, removed, or
-- hidden message. Change them together.
create or replace function public.my_inbox(p_archived boolean default false)
returns table (
  conversation_id uuid, kind text, group_id uuid, title text,
  other_user_id uuid, request_state text, requested_by uuid,
  last_message_at timestamptz, last_message_id uuid,
  last_message_preview text, last_message_kind text, last_sender_id uuid,
  unread_count int, muted boolean, archived boolean
)
language sql security definer set search_path = '' stable as $$
with me as (select (select auth.uid()) as uid),
blocked as (
  select b.blocked_id as uid from public.user_blocks b, me
    where b.blocker_id = me.uid
  union
  select b.blocker_id from public.user_blocks b, me
    where b.blocked_id = me.uid
),
mine as (
  select c.* from public.conversations c
   where c.kind = 'group' and public.is_group_member(c.group_id)
  union all
  select c.* from public.conversations c, me
   where c.kind = 'dm' and (c.dm_user_a = me.uid or c.dm_user_b = me.uid)
     and not exists (select 1 from public.dm_request_declines d
                     where d.recipient_id = me.uid and d.requester_id = c.requested_by)
  union all
  select c.* from public.conversations c
   join public.conversation_participants p on p.conversation_id = c.id, me
   where c.kind = 'custom' and p.user_id = me.uid
)
select m.id, m.kind, m.group_id,
       coalesce(m.title, g.name),
       case when m.kind = 'dm'
            then case when m.dm_user_a = me.uid then m.dm_user_b else m.dm_user_a end
       end,
       m.request_state, m.requested_by,
       m.last_message_at, last.id,
       case when last.deleted then ''
            else left(coalesce(nullif(last.body, ''), last.share_label, ''), 140) end,
       last.kind, last.sender_id,
       coalesce(u.n, 0)::int,
       coalesce(s.muted, false), coalesce(s.archived, false)
from mine m
cross join me
left join public.groups g on g.id = m.group_id
left join public.conversation_state s
       on s.conversation_id = m.id and s.user_id = me.uid
left join lateral (
  select x.id, x.body, x.share_label, x.sender_id, x.deleted, x.kind
  from public.messages x
  where x.conversation_id = m.id and not x.removed and not x.auto_hidden
    and x.sender_id not in (select uid from blocked)
  order by x.created_at desc, x.id desc limit 1
) last on true
left join lateral (
  -- capped at 100 so a huge backlog cannot blow up the inbox; the client
  -- renders the cap as "99+"
  select count(*) as n from (
    select 1 from public.messages x
    where x.conversation_id = m.id
      and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz)
      and x.sender_id <> me.uid
      and not x.deleted and not x.removed and not x.auto_hidden
      and x.kind <> 'system'
      and x.sender_id not in (select uid from blocked)
    order by x.created_at desc limit 100
  ) z
) u on true
where coalesce(s.archived, false) = coalesce(p_archived, false)
order by m.last_message_at desc;
$$;
revoke all on function public.my_inbox(boolean) from public, anon;
grant execute on function public.my_inbox(boolean) to authenticated;

-- Read receipts without exposing anyone's mute/archive.
create or replace function public.conversation_read_receipts(p_conversation_id uuid)
returns table (user_id uuid, last_read_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.user_id, s.last_read_at
  from public.conversation_state s
  where s.conversation_id = p_conversation_id
    and public.can_read_conversation(p_conversation_id)
    and s.last_read_at > '-infinity'::timestamptz;
$$;
revoke all on function public.conversation_read_receipts(uuid) from public, anon;
grant execute on function public.conversation_read_receipts(uuid) to authenticated;

-- Deliberately SECURITY INVOKER: a definer version would have to restate the
-- whole messages_select_member predicate, and the day the policy changes and
-- this does not is the day search leaks. Invoker rights keep RLS the single
-- source of truth. It still needs the explicit grant (GRANTS LAW).
create or replace function public.search_my_messages(
  p_query text, p_limit int default 50, p_before timestamptz default null)
returns table (
  message_id uuid, conversation_id uuid, sender_id uuid,
  body text, created_at timestamptz, rank real)
language sql stable set search_path = '' as $$
  select m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
         ts_rank(m.search, websearch_to_tsquery('english', p_query))
  from public.messages m
  where p_query is not null and char_length(btrim(p_query)) > 0
    and m.search @@ websearch_to_tsquery('english', p_query)
    and not m.deleted
    and m.kind <> 'system'
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(coalesce(p_limit, 50), 100);
$$;
revoke all on function public.search_my_messages(text, int, timestamptz) from public, anon;
grant execute on function public.search_my_messages(text, int, timestamptz) to authenticated;

-- ---- trigger internals (no grant, ever) -------------------------------------

create or replace function public.touch_conversation_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at
   where id = new.conversation_id and last_message_at < new.created_at;
  return new;
end;
$$;
create trigger on_message_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_activity();
revoke all on function public.touch_conversation_activity() from public, anon, authenticated;

-- ID-ONLY payload: no body, no preview. The send-push Edge Function resolves
-- the sender name and the text with the service key, exactly as it already
-- resolves group and title names. Nothing renderable leaves via pg_net.
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'system' then
    return new;
  end if;
  perform public.push_notify(jsonb_build_object(
    'event', 'new_message',
    'message_id', new.id,
    'conversation_id', new.conversation_id,
    'actor_id', new.sender_id));
  return new;
end;
$$;
create trigger on_message_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();
revoke all on function public.notify_new_message() from public, anon, authenticated;

-- Three distinct reporters hide a message — EXCEPT in a DM, where only two
-- people exist and the threshold is unreachable, so one report hides it.
create or replace function public.auto_hide_reported_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
begin
  select c.kind into v_kind from public.conversations c where c.id = new.conversation_id;
  if v_kind = 'dm'
     or (select count(*) from public.message_reports
          where message_id = new.message_id) >= 3 then
    update public.messages set auto_hidden = true
     where id = new.message_id and not auto_hidden;
  end if;
  return new;
end;
$$;
create trigger on_message_report_threshold
  after insert on public.message_reports
  for each row execute function public.auto_hide_reported_message();
revoke all on function public.auto_hide_reported_message() from public, anon, authenticated;

create or replace function public.create_group_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.conversations (kind, group_id, created_by)
  values ('group', new.id, new.owner_id)
  on conflict (group_id) where kind = 'group' do nothing;
  return new;
end;
$$;
create trigger on_group_created_conversation
  after insert on public.groups
  for each row execute function public.create_group_conversation();
revoke all on function public.create_group_conversation() from public, anon, authenticated;

-- every group that already exists gets its chat
insert into public.conversations (kind, group_id, created_by)
select 'group', g.id, g.owner_id from public.groups g
on conflict (group_id) where kind = 'group' do nothing;

-- ---- realtime ---------------------------------------------------------------
-- conversation_participants is deliberately ABSENT: leave_chat deletes rows,
-- and DELETE events bypass RLS (see the header). Roster changes ride a
-- 'system' message instead.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.conversation_state;

-- ---- account deletion -------------------------------------------------------
-- Re-issued to cover messaging. Cascades handle most of it (messages.sender_id,
-- conversation_state, message_reactions, message_reports, dm_request_declines,
-- conversation_participants, and whole DM threads via dm_user_a/dm_user_b —
-- a DM is jointly owned, so it goes with either party). messages.reply_to_id
-- is SET NULL so surviving replies keep their anchor, and
-- conversations.created_by is SET NULL so custom chats outlive their creator.
--
-- The one case cascades get WRONG is a custom chat: the leaver's participant
-- row simply vanishes, and if they were the last one the conversation is left
-- with ZERO participants — invisible to everyone (is_conversation_member is
-- false for all) and impossible to open, leave, or delete. Orphan forever.
-- So custom chats are handed off or deleted explicitly, before the auth
-- delete, exactly as owned groups already are.
--
-- Note auto_hidden is NOT recomputed when a reporter's rows cascade away: a
-- hidden message stays hidden. Fail-closed, intended.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group record;
  v_conv record;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  for v_group in
    select g.id from public.groups g where g.owner_id = v_uid
  loop
    select gm.user_id into v_heir
    from public.group_members gm
    where gm.group_id = v_group.id and gm.user_id <> v_uid
    order by gm.joined_at asc, gm.user_id asc
    limit 1;

    if v_heir is null then
      delete from public.groups where id = v_group.id;
    else
      update public.groups set owner_id = v_heir where id = v_group.id;
      update public.group_members set role = 'owner'
        where group_id = v_group.id and user_id = v_heir;
    end if;
  end loop;

  for v_conv in
    select c.id from public.conversations c
    join public.conversation_participants p on p.conversation_id = c.id
    where c.kind = 'custom' and p.user_id = v_uid
  loop
    select p.user_id into v_heir
    from public.conversation_participants p
    where p.conversation_id = v_conv.id and p.user_id <> v_uid
    order by p.joined_at asc, p.user_id asc
    limit 1;

    if v_heir is null then
      delete from public.conversations where id = v_conv.id;
    elsif not exists (
      select 1 from public.conversation_participants q
      where q.conversation_id = v_conv.id and q.user_id <> v_uid and q.role = 'owner'
    ) then
      update public.conversation_participants set role = 'owner'
        where conversation_id = v_conv.id and user_id = v_heir;
    end if;
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

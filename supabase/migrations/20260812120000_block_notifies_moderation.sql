-- Guideline 1.2: "a mechanism for users to block abusive users (blocking
-- should also notify the developer of the inappropriate content and should
-- remove it from the user's feed instantly)".
--
-- Blocking already removed the person from the blocker's view instantly
-- (message visibility, comment visibility and DM delivery all consult
-- user_blocks). What it did NOT do is tell us: block_user wrote user_blocks
-- and nothing reached the moderation queue, so the strongest signal a user can
-- send about someone was invisible to the only people who can eject them.
--
-- A block now files a report for that user's most recent message in the
-- conversation it was raised from, which puts it in `moderation_queue` under
-- the same 24-hour clock as any other report. Reusing the report path is the
-- point: no new queue, no new SLA, no second thing to remember to look at.

alter table public.user_blocks
  add column if not exists reason text
    check (reason is null or char_length(reason) <= 300);

-- Drop-and-recreate: adding defaulted parameters changes the signature, and
-- PostgREST resolves overloads by argument NAMES (the same drop+recreate the
-- late_score_session one-liner needed).
drop function if exists public.block_user(uuid);

create or replace function public.block_user(
  p_user_id uuid,
  p_conversation_id uuid default null,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_message_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'pick someone else';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (v_uid, p_user_id, left(nullif(btrim(coalesce(p_reason, '')), ''), 300))
  on conflict (blocker_id, blocked_id) do update
    set reason = coalesce(excluded.reason, public.user_blocks.reason);

  insert into public.dm_request_declines (recipient_id, requester_id)
  select v_uid, p_user_id
   where exists (select 1 from public.conversations c
                 where c.kind = 'dm' and c.request_state = 'pending'
                   and c.requested_by = p_user_id
                   and (c.dm_user_a = v_uid or c.dm_user_b = v_uid))
  on conflict do nothing;

  -- Notify us. Scoped to a conversation the blocker is actually in (the
  -- membership check is what stops this becoming a way to report messages you
  -- were never able to see).
  if p_conversation_id is not null and public.is_conversation_member(p_conversation_id) then
    select m.id into v_message_id
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = p_user_id
      and not m.deleted
    order by m.created_at desc, m.id desc
    limit 1;

    if v_message_id is not null then
      -- conversation_id is NOT NULL and part of the composite FK to
      -- messages (id, conversation_id): omitting it fails the insert.
      insert into public.message_reports (message_id, conversation_id, reporter_id, reason)
      values (
        v_message_id,
        p_conversation_id,
        v_uid,
        left(
          coalesce(nullif(btrim(coalesce(p_reason, '')), '') || ' (via block)', 'Blocked by a user'),
          300
        )
      )
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke all on function public.block_user(uuid, uuid, text) from public, anon;
grant execute on function public.block_user(uuid, uuid, text) to authenticated;

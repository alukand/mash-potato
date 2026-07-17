-- One-line takes: each member may write one sentence ("In one sentence,
-- what was it about?") on their BLIND scorecard; it drops with the scores
-- at the reveal.
--
-- The column rides the SAME member_scores row as scores, so THE ONE RULE's
-- row-level read gating seals it with no new policies: nobody reads your
-- sentence until the session is revealed AND their own card is locked.
-- Optional everywhere; never blocks locking; max 140 chars.

-- ============================ 1. the column =================================
alter table public.member_scores
  add column one_liner text
    constraint member_scores_one_liner_len
    check (one_liner is null or char_length(one_liner) between 1 and 140);

-- ====================== 2. late scoring carries it ==========================
-- Signature change (new defaulted param). CREATE OR REPLACE would leave the
-- old two-arg function behind as an overload and PostgREST refuses ambiguous
-- RPC names, so drop the old signature and recreate (grants die with the
-- drop — re-granted below).
drop function public.late_score_session(uuid, jsonb);

create function public.late_score_session(
  p_session_id uuid,
  p_scores jsonb,
  p_one_liner text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_keys text[];
  v_bad int;
  v_locked boolean;
  v_line text := nullif(trim(p_one_liner), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.session_is_revealed(p_session_id) then
    raise exception 'late scoring is only for revealed sessions';
  end if;
  if not public.is_group_member(public.session_group_id(p_session_id)) then
    raise exception 'not a member of this group';
  end if;

  if p_scores is null or jsonb_typeof(p_scores) <> 'object' or p_scores = '{}'::jsonb then
    raise exception 'scores must be a non-empty object';
  end if;
  if char_length(v_line) > 140 then
    raise exception 'one-liner must be 140 characters or fewer';
  end if;

  select coalesce(array_agg(e->>'key'), '{}') into v_keys
  from public.reveal_sessions rs,
       jsonb_array_elements(coalesce(rs.rubric, '[]'::jsonb)) e
  where rs.id = p_session_id;

  -- every entry maps a category of THIS session to a whole number 1..10
  select count(*) into v_bad
  from jsonb_each(p_scores) kv
  where not (kv.key = any (v_keys)) or kv.value::text !~ '^(10|[1-9])$';
  if v_bad > 0 then
    raise exception 'scores must map this session''s categories to whole numbers 1-10';
  end if;

  select ms.locked into v_locked
  from public.member_scores ms
  where ms.session_id = p_session_id and ms.member_id = v_uid;

  if v_locked is true then
    raise exception 'already locked in for this session';
  elsif v_locked is false then
    -- an unlocked leftover from the blind phase never counted; replace it
    -- (but keep a drafted one-liner when the late call brings none)
    update public.member_scores
      set scores = p_scores, locked = true,
          one_liner = coalesce(v_line, one_liner)
      where session_id = p_session_id and member_id = v_uid;
  else
    insert into public.member_scores (session_id, member_id, scores, locked, one_liner)
    values (p_session_id, v_uid, p_scores, true, v_line);
  end if;

  -- ping realtime (reveal_sessions is in the publication) so open clients
  -- refresh the Mashed score
  update public.reveal_sessions set state = state where id = p_session_id;
end;
$$;

revoke execute on function public.late_score_session(uuid, jsonb, text) from public;
grant execute on function public.late_score_session(uuid, jsonb, text) to authenticated;

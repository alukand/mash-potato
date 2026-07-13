-- Living reveals: the Mashed score stays open after the reveal.
--
-- A revealed session is the score SO FAR, not a frozen verdict:
--   * late_score_session      — a member with no LOCKED scorecard (someone who
--                               joined the group later, or sat the round out)
--                               adds their scores; the Mashed recomputes.
--   * backfill_category_score — when the group's rubric grows a category, a
--                               member who already locked fills in JUST that
--                               gap. The category is appended to the session's
--                               rubric snapshot (append-only, current
--                               effective weight) the first time.
--
-- THE ONE RULE (read gating on member_scores) is untouched. Write paths
-- tighten: direct INSERT is now blind-only, post-reveal writes exist ONLY
-- through these two constrained functions — locked scores can never be
-- changed, only missing ones added. Both RPCs touch the session row so
-- realtime pings every open client.

-- ====================== 1. direct inserts are blind-only ====================
drop policy scores_insert_own on public.member_scores;
create policy scores_insert_own on public.member_scores
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_group_member(public.session_group_id(session_id))
    and not public.session_is_revealed(session_id)
  );

-- ============================ 2. late scoring ================================
create or replace function public.late_score_session(p_session_id uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_keys text[];
  v_bad int;
  v_locked boolean;
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
    update public.member_scores
      set scores = p_scores, locked = true
      where session_id = p_session_id and member_id = v_uid;
  else
    insert into public.member_scores (session_id, member_id, scores, locked)
    values (p_session_id, v_uid, p_scores, true);
  end if;

  -- ping realtime (reveal_sessions is in the publication) so open clients
  -- refresh the Mashed score
  update public.reveal_sessions set state = state where id = p_session_id;
end;
$$;

revoke execute on function public.late_score_session(uuid, jsonb) from public;
grant execute on function public.late_score_session(uuid, jsonb) to authenticated;

-- ====================== 3. category backfill ================================
create or replace function public.backfill_category_score(
  p_session_id uuid,
  p_category_key text,
  p_score int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_row public.member_scores;
  v_in_rubric boolean;
  v_label text;
  v_weight numeric;
  v_members int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  v_group := public.session_group_id(p_session_id);
  if not public.session_is_revealed(p_session_id) then
    raise exception 'backfill is only for revealed sessions';
  end if;
  if not public.is_group_member(v_group) then
    raise exception 'not a member of this group';
  end if;
  if p_score is null or p_score < 1 or p_score > 10 then
    raise exception 'score must be a whole number 1-10';
  end if;
  if p_category_key is null or p_category_key !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$' then
    raise exception 'invalid category key';
  end if;

  select ms.* into v_row
  from public.member_scores ms
  where ms.session_id = p_session_id and ms.member_id = v_uid;
  if v_row.id is null or not v_row.locked then
    raise exception 'backfill needs a locked scorecard';
  end if;
  if v_row.scores ? p_category_key then
    raise exception 'category already scored';
  end if;

  -- The category must be in the snapshot already, or currently carried
  -- (enabled) by at least one member. In the second case it joins the
  -- snapshot append-only, at the group's current effective weight (mean
  -- across members, absent counts as 0 — same math as mashRubrics).
  select exists (
    select 1
    from public.reveal_sessions rs,
         jsonb_array_elements(coalesce(rs.rubric, '[]'::jsonb)) e
    where rs.id = p_session_id and e->>'key' = p_category_key
  ) into v_in_rubric;

  if not v_in_rubric then
    select count(*) into v_members
    from public.group_members gm
    where gm.group_id = v_group;

    select max(mr.label), coalesce(sum(mr.weight), 0)::numeric
      into v_label, v_weight
    from public.member_rubrics mr
    where mr.group_id = v_group
      and mr.category_key = p_category_key
      and mr.enabled;

    if v_label is null or v_members = 0 then
      raise exception 'category is not part of this group''s rubric';
    end if;
    v_weight := round(v_weight / v_members, 1);
    if v_weight <= 0 then
      raise exception 'category has no effective weight in this group';
    end if;

    update public.reveal_sessions
      set rubric = coalesce(rubric, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('key', p_category_key, 'label', v_label, 'weight', v_weight))
      where id = p_session_id;
  end if;

  update public.member_scores
    set scores = scores || jsonb_build_object(p_category_key, p_score)
    where id = v_row.id;

  update public.reveal_sessions set state = state where id = p_session_id;
end;
$$;

revoke execute on function public.backfill_category_score(uuid, text, int) from public;
grant execute on function public.backfill_category_score(uuid, text, int) to authenticated;

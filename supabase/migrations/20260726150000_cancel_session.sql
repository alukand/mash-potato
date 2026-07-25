-- Call off a blind round.
--
-- Before this, a mistaken round was a TRAP: reveal_sessions has no delete
-- policy (a client .delete() silently affects 0 rows), both entry points for
-- starting a round are disabled while one is blind, and the only exit is
-- reveal_session — which needs TWO locked scorecards. So clearing a wrong
-- title required two people to score a film they hadn't watched, or deleting
-- the whole group.
--
-- Design laws:
--   * BLIND ONLY. A revealed round is history; prevent_unreveal exists to
--     make it immutable, and a delete path must not launder that invariant.
--   * Owner OR created_by, exactly matching reveal_session's authorization.
--   * HARD delete. Only two FKs point at reveal_sessions — member_scores and
--     session_rsvps, both ON DELETE CASCADE — so nothing orphans. A soft
--     cancel would need a third reveal_state value, and all four
--     member_scores policies would have to be re-audited against it; not
--     worth the risk to THE ONE RULE for an undo.
--
-- Two things cancelling cannot do, by construction:
--   * it cannot recall the round_started push (already sent, fire-and-forget)
--   * it silently reopens the title's group discussion thread, because
--     comments_open_for_me reads session state. That is the correct outcome
--     (the round never happened), just not an obvious one.

create or replace function public.cancel_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_state public.reveal_state;
  v_group uuid;
begin
  select state, group_id into v_state, v_group
    from public.reveal_sessions where id = p_session_id;

  if v_state is null then
    raise exception 'that round is gone';
  end if;

  -- authorize before saying anything about the round's state
  if not (
    public.is_group_owner(v_group)
    or exists (
      select 1 from public.reveal_sessions
      where id = p_session_id and created_by = (select auth.uid())
    )
  ) then
    raise exception 'only the group owner or whoever started it can call off a round';
  end if;

  if v_state <> 'blind' then
    raise exception 'a revealed round is part of the group history';
  end if;

  -- member_scores and session_rsvps cascade from here
  delete from public.reveal_sessions where id = p_session_id;
end;
$$;

revoke all on function public.cancel_session(uuid) from public, anon;
grant execute on function public.cancel_session(uuid) to authenticated;

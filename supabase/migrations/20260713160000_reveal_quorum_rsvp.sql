-- Reveal quorum, RSVP-aware. The previous quorum (20260713110000) counted
-- ALL group members, so a round where everyone but one member passed could
-- never be revealed (1 lock < least(3, 2) forever). The quorum now counts
-- ELIGIBLE members only, mirroring src/lib/rsvp.ts exactly:
--   * scoring always counts as in (any member_scores row, locked or not)
--   * an explicit RSVP decides otherwise ('in' counts, 'pass' does not)
--   * no answer counts as in only while the 24h invite window is open;
--     after that it is a pass (computed at call time, never stored)
-- Required locks = least(2, greatest(eligible, 1)): solo rounds and
-- everyone-else-passed rounds reveal on one lock; otherwise one press still
-- never drops the reveal on a group where a second card could arrive.
-- The interval below must stay in sync with RSVP_WINDOW_MS in src/lib/rsvp.ts.

create or replace function public.reveal_session(p_session_id uuid)
returns public.reveal_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.reveal_sessions;
  v_group uuid;
  v_created_at timestamptz;
  v_eligible int;
  v_locked int;
begin
  if not (
    public.is_group_owner(public.session_group_id(p_session_id))
    or exists (
      select 1 from public.reveal_sessions
      where id = p_session_id and created_by = (select auth.uid())
    )
  ) then
    raise exception 'not authorised to reveal this session';
  end if;

  v_group := public.session_group_id(p_session_id);
  select created_at into v_created_at
    from public.reveal_sessions where id = p_session_id;

  select count(*) into v_eligible
    from public.group_members gm
    where gm.group_id = v_group
      and (
        exists (
          select 1 from public.member_scores ms
          where ms.session_id = p_session_id and ms.member_id = gm.user_id
        )
        or exists (
          select 1 from public.session_rsvps r
          where r.session_id = p_session_id
            and r.member_id = gm.user_id and r.status = 'in'
        )
        or (
          now() < v_created_at + interval '24 hours'
          and not exists (
            select 1 from public.session_rsvps r
            where r.session_id = p_session_id and r.member_id = gm.user_id
          )
        )
      );

  select count(*) into v_locked
    from public.member_scores
    where session_id = p_session_id and locked;

  if v_locked < least(2, greatest(v_eligible, 1)) then
    raise exception 'the reveal needs a second locked scorecard';
  end if;

  update public.reveal_sessions
    set state = 'revealed', revealed_at = now()
    where id = p_session_id and state = 'blind'
    returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.reveal_session(uuid) from public;
grant execute on function public.reveal_session(uuid) to authenticated;

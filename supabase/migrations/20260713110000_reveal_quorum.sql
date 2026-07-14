-- Reveal quorum: one person locking in must not drop the reveal on everyone.
-- In a multi-member group the reveal now needs at least TWO locked
-- scorecards (solo groups still reveal with one). Enforced server-side in
-- the reveal_session RPC — the UI gate is a convenience, not the boundary.

create or replace function public.reveal_session(p_session_id uuid)
returns public.reveal_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.reveal_sessions;
  v_group uuid;
  v_members int;
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
  select count(*) into v_members from public.group_members where group_id = v_group;
  select count(*) into v_locked
    from public.member_scores
    where session_id = p_session_id and locked;
  if v_locked < least(v_members, 2) then
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

-- Live sessions support.
--
-- 1. Manual title entry: TMDB metadata arrives in a later milestone, so
--    titles can exist without a tmdb_id. (The unique (tmdb_id, media_type)
--    pair still dedupes real TMDB titles; NULLs don't collide.)
alter table public.titles alter column tmdb_id drop not null;

-- 2. Lock-status metadata. While a session is BLIND, members may see WHO has
--    locked in — never the scores. SECURITY DEFINER so it can read rows the
--    caller's RLS hides, returning ONLY (member_id, locked). Non-members get
--    an empty set.
create or replace function public.session_lock_status(p_session_id uuid)
returns table (member_id uuid, locked boolean)
language sql security definer set search_path = '' stable as $$
  select ms.member_id, ms.locked
  from public.member_scores ms
  where ms.session_id = p_session_id
    and public.is_group_member(public.session_group_id(p_session_id))
$$;

revoke execute on function public.session_lock_status(uuid) from public;
grant execute on function public.session_lock_status(uuid) to authenticated;

-- 3. Realtime: broadcast reveal_sessions changes so the Reveal drops for
--    every member the moment it happens. postgres_changes respects RLS, so
--    only group members receive the events.
alter publication supabase_realtime add table public.reveal_sessions;

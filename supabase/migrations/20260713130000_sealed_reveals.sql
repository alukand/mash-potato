-- Sealed reveals: the reveal opens PER MEMBER, only after your own card is
-- locked. THE ONE RULE gains a clause — a member reads others' scores only
-- when the session is revealed AND they have locked their own scorecard.
--
-- Side effect on purpose: late scoring is genuinely blind again. A member who
-- hasn't voted can't peek at the group's scores, score to match, and fold in;
-- their sliders are as blind as everyone else's were on reveal night.

-- The policy can't subquery its own table (RLS recursion), so membership in
-- the reveal is answered by a SECURITY DEFINER helper, like its siblings.
create or replace function public.has_locked_scorecard(p_session_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.member_scores
    where session_id = p_session_id
      and member_id = (select auth.uid())
      and locked
  );
$$;

revoke execute on function public.has_locked_scorecard(uuid) from public;
grant execute on function public.has_locked_scorecard(uuid) to authenticated;

drop policy scores_select_revealed on public.member_scores;
create policy scores_select_revealed on public.member_scores
  for select to authenticated
  using (
    member_id <> (select auth.uid())
    and public.session_is_revealed(session_id)
    and public.is_group_member(public.session_group_id(session_id))
    and public.has_locked_scorecard(session_id)
  );

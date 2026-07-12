-- Session RSVPs: who's in for this round.
--
-- Starting a session invites the whole group. Members answer "in" or "pass";
-- no answer within 24 hours counts as a pass (computed at READ time from the
-- session's created_at — no timers). Scoring a session always counts as
-- joining, so a passer can jump in later simply by rating. The reveal then
-- only waits on members who are actually in.
--
-- No score data lives here, so the blind rule is untouched.

create table public.session_rsvps (
  session_id uuid not null references public.reveal_sessions (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('in', 'pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
create index session_rsvps_session_id_idx on public.session_rsvps (session_id);

alter table public.session_rsvps enable row level security;

-- Who's in is group-social information: visible to the session's group,
-- answerable only for yourself.
create policy rsvps_select_member on public.session_rsvps
  for select to authenticated
  using (public.is_group_member(public.session_group_id(session_id)));
create policy rsvps_insert_self on public.session_rsvps
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_group_member(public.session_group_id(session_id))
  );
create policy rsvps_update_self on public.session_rsvps
  for update to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

grant select, insert, update on public.session_rsvps to authenticated;

create trigger session_rsvps_touch_updated_at
  before update on public.session_rsvps
  for each row execute function public.touch_updated_at();

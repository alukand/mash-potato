-- What's next? — the group votes on it.
--
-- The group owner opens a poll with 2-5 title options (pulled from the
-- group's watchlists or search); members cast ONE vote each (switchable
-- while the poll is open, live tally for everyone); the owner closes it
-- and the winner becomes the next round's pick.
--
-- Integrity is structural: poll_options carries unique (id, poll_id) so
-- both poll_votes.option_id and group_polls.winner_option_id use composite
-- FKs — a vote or a winner can only ever point at an option of THAT poll.
-- One OPEN poll per group (partial unique index). Writes to polls/options
-- exist only via the two owner-gated definer RPCs; votes are direct,
-- self-only, open-poll-only.
--
-- GRANTS LAW: default privileges grant nothing — every function below is
-- granted explicitly (authenticated) and revoked from public/anon.

create table public.group_polls (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status     text not null default 'open' check (status in ('open', 'closed')),
  winner_option_id uuid,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index group_polls_group_idx on public.group_polls (group_id, created_at desc);
create unique index group_polls_one_open on public.group_polls (group_id)
  where status = 'open';

create table public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.group_polls (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete restrict,
  sort     int not null default 0,
  unique (poll_id, title_id),
  unique (id, poll_id)
);
create index poll_options_poll_idx on public.poll_options (poll_id);

alter table public.group_polls
  add constraint group_polls_winner_is_own_option
  foreign key (winner_option_id, id)
  references public.poll_options (id, poll_id);

create table public.poll_votes (
  poll_id    uuid not null references public.group_polls (id) on delete cascade,
  option_id  uuid not null,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, member_id),
  foreign key (option_id, poll_id)
    references public.poll_options (id, poll_id) on delete cascade
);
create index poll_votes_option_idx on public.poll_votes (option_id);

-- ---- helpers ---------------------------------------------------------------

create function public.poll_group_id(p_poll_id uuid)
returns uuid language sql security definer set search_path = '' stable as $$
  select group_id from public.group_polls where id = p_poll_id
$$;
revoke all on function public.poll_group_id(uuid) from public, anon;
grant execute on function public.poll_group_id(uuid) to authenticated;

create function public.poll_is_open(p_poll_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.group_polls where id = p_poll_id and status = 'open')
$$;
revoke all on function public.poll_is_open(uuid) from public, anon;
grant execute on function public.poll_is_open(uuid) to authenticated;

-- ---- RLS -------------------------------------------------------------------

alter table public.group_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy polls_select_members on public.group_polls
  for select to authenticated
  using (public.is_group_member(group_id));

create policy poll_options_select_members on public.poll_options
  for select to authenticated
  using (public.is_group_member(public.poll_group_id(poll_id)));

create policy poll_votes_select_members on public.poll_votes
  for select to authenticated
  using (public.is_group_member(public.poll_group_id(poll_id)));

-- Votes: yours only, while the poll is open. Switching = upsert (update).
create policy poll_votes_insert_own on public.poll_votes
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_group_member(public.poll_group_id(poll_id))
    and public.poll_is_open(poll_id)
  );
create policy poll_votes_update_own on public.poll_votes
  for update to authenticated
  using (member_id = (select auth.uid()) and public.poll_is_open(poll_id))
  with check (member_id = (select auth.uid()) and public.poll_is_open(poll_id));
create policy poll_votes_delete_own on public.poll_votes
  for delete to authenticated
  using (member_id = (select auth.uid()) and public.poll_is_open(poll_id));

-- Polls/options have NO direct write policies: the RPCs below are the only
-- write path (owner-gated, option count enforced).

-- ---- RPCs ------------------------------------------------------------------

create function public.create_group_poll(p_group_id uuid, p_title_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_poll uuid;
  v_count int := coalesce(array_length(p_title_ids, 1), 0);
  i int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can start a vote';
  end if;
  if v_count < 2 or v_count > 5 then
    raise exception 'a vote needs 2 to 5 options';
  end if;
  if exists (
    select 1 from public.group_polls
    where group_id = p_group_id and status = 'open'
  ) then
    raise exception 'this group already has an open vote';
  end if;

  insert into public.group_polls (group_id, created_by)
  values (p_group_id, v_uid)
  returning id into v_poll;

  for i in 1..v_count loop
    insert into public.poll_options (poll_id, title_id, sort)
    values (v_poll, p_title_ids[i], i);
  end loop;

  return v_poll;
end;
$$;
revoke all on function public.create_group_poll(uuid, uuid[]) from public, anon;
grant execute on function public.create_group_poll(uuid, uuid[]) to authenticated;

-- Close the vote and crown the winner: most votes, ties broken by option
-- order (the owner listed the tie-winner first).
create function public.close_group_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_winner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select group_id into v_group from public.group_polls
    where id = p_poll_id and status = 'open';
  if v_group is null then
    raise exception 'no open vote to close';
  end if;
  if not public.is_group_owner(v_group) then
    raise exception 'only the group owner can close the vote';
  end if;

  select o.id into v_winner
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll_id
  group by o.id, o.sort
  order by count(v.member_id) desc, o.sort asc
  limit 1;

  update public.group_polls
    set status = 'closed', winner_option_id = v_winner, closed_at = now()
    where id = p_poll_id;
end;
$$;
revoke all on function public.close_group_poll(uuid) from public, anon;
grant execute on function public.close_group_poll(uuid) to authenticated;

-- Live tallies for everyone with the poll open on screen.
alter publication supabase_realtime add table public.group_polls;
alter publication supabase_realtime add table public.poll_votes;

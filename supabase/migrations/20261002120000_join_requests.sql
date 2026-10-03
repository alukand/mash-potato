-- Join requests: a searchable group can review who joins, optionally with a
-- question the owner reads before deciding.
--
-- Discovery (20260909142308) made a group either invite-only or open to
-- anyone signed in. A searchable group now also has a join policy:
--   * 'open'      anyone joins at once (join_open_group, as before)
--   * 'approval'  people ASK (request_to_join); the owner approves or declines
-- An approval group may set ONE question. Every applicant answers it, and the
-- owner reads the answer with the request. The question is shown to anyone
-- browsing and the answer to the owner, so both are user-generated content:
-- they pass the same wordlist as comments and messages.
--
-- Approving is an ordinary membership insert, so it runs every existing
-- membership trigger, including the "added you to the group" push.

alter table public.group_discovery
  add column join_policy text not null default 'open'
    check (join_policy in ('open', 'approval')),
  add column join_question text
    check (join_question is null or char_length(join_question) between 1 and 200);

create table public.group_join_requests (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- the question as it was asked: a later edit cannot change what they answered
  question   text,
  answer     text check (answer is null or char_length(answer) between 1 and 500),
  status     text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
-- one open request per person per group
create unique index group_join_requests_one_pending
  on public.group_join_requests (group_id, user_id) where status = 'pending';
create index group_join_requests_pending_by_group
  on public.group_join_requests (group_id, created_at) where status = 'pending';

-- RPC-only, like every other table here that holds what one person sent another.
alter table public.group_join_requests enable row level security;
revoke all on public.group_join_requests from public, anon, authenticated;

-- ---- the catalogue: now says how each group takes new members ---------------
-- Same public, metadata-only listing, plus the join policy, the question (only
-- an approval group has one), and, for a signed-in caller, whether they are
-- already in or already asked. The return type changed, hence drop + create.
drop function public.browse_open_groups(text, boolean);
create function public.browse_open_groups(p_query text default '', p_suggested_only boolean default false)
returns table(
  id uuid, name text, taste_mode text, member_count bigint,
  join_policy text, join_question text, my_status text
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.taste_mode,
    (select count(*) from public.group_members m where m.group_id = g.id),
    d.join_policy,
    case when d.join_policy = 'approval' then d.join_question end,
    case
      when (select auth.uid()) is null then null
      when exists (select 1 from public.group_members m
                    where m.group_id = g.id and m.user_id = (select auth.uid())) then 'member'
      when exists (select 1 from public.group_join_requests r
                    where r.group_id = g.id and r.user_id = (select auth.uid())
                      and r.status = 'pending') then 'pending'
    end
  from public.groups g join public.group_discovery d on d.group_id = g.id
  join public.profiles owner on owner.id = g.owner_id
  where d.searchable and not owner.banned
    and (not p_suggested_only or d.suggested)
    and position(lower(left(coalesce(p_query, ''), 80)) in lower(g.name)) > 0
    and not exists (select 1 from public.banned_terms t where g.name ~* ('\m' || t.term || '\M'))
  order by d.suggested desc, g.name, g.id limit 30;
$$;
revoke all on function public.browse_open_groups(text, boolean) from public, anon;
grant execute on function public.browse_open_groups(text, boolean) to anon, authenticated;

-- ---- join_open_group: never a way around approval ----------------------------
-- Unchanged from 20260909142308 except that an approval group refuses (an
-- older app would otherwise skip the owner entirely), and joining an open
-- group retires any request the caller had left waiting there.
create or replace function public.join_open_group(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); g public.groups;
begin
  if v_uid is null then raise exception 'sign in to join a group'; end if;
  if not exists(select 1 from public.profiles where id = v_uid and not banned) then raise exception 'joining groups is unavailable'; end if;
  -- Same lock order as discovery updates; closing a group cannot race a join.
  select * into g from public.groups where id = p_group_id for update;
  if g.id is null then raise exception 'this group is not open to join'; end if;
  if exists(select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then return p_group_id; end if;
  if not exists(select 1 from public.group_discovery where group_id = p_group_id and searchable)
    or exists(select 1 from public.profiles where id = g.owner_id and banned)
    or exists(select 1 from public.group_join_blocks where group_id = p_group_id and user_id = v_uid)
    or exists(select 1 from public.banned_terms t where g.name ~* ('\m' || t.term || '\M')) then
    raise exception 'this group is not open to join';
  end if;
  if (select join_policy from public.group_discovery where group_id = p_group_id) = 'approval' then
    raise exception 'this group reviews requests to join';
  end if;
  insert into public.group_members(group_id, user_id, role) values(p_group_id, v_uid, 'member') on conflict do nothing;
  update public.group_join_requests set status = 'withdrawn', decided_at = now()
   where group_id = p_group_id and user_id = v_uid and status = 'pending';
  return p_group_id;
end;
$$;
revoke all on function public.join_open_group(uuid) from public, anon;
grant execute on function public.join_open_group(uuid) to authenticated;

-- ---- the owner's side -------------------------------------------------------------
create function public.set_group_join_policy(p_group_id uuid, p_policy text, p_question text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g    public.groups;
  v_q  text := nullif(btrim(coalesce(p_question, '')), '');
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into g from public.groups where id = p_group_id for update;
  if g.id is null or g.owner_id <> auth.uid() then
    raise exception 'only the group owner can change who joins';
  end if;
  if p_policy is null or p_policy not in ('open', 'approval') then
    raise exception 'choose whether anyone can join or you approve each request';
  end if;
  -- an open group asks nothing
  if p_policy = 'open' then v_q := null; end if;
  if v_q is not null then
    if char_length(v_q) > 200 or v_q ~ '[\x00-\x1F\x7F]' then
      raise exception 'that question is not usable';
    end if;
    if exists (select 1 from public.banned_terms t where v_q ~* ('\m' || t.term || '\M')) then
      raise exception 'that question contains language that is not allowed here';
    end if;
  end if;
  insert into public.group_discovery (group_id, join_policy, join_question)
  values (p_group_id, p_policy, v_q)
  on conflict (group_id) do update
    set join_policy = excluded.join_policy, join_question = excluded.join_question;
end;
$$;
revoke all on function public.set_group_join_policy(uuid, text, text) from public, anon;
grant execute on function public.set_group_join_policy(uuid, text, text) to authenticated;

-- group_discovery_settings (a bare boolean) stays as it is for the apps that
-- already call it; this is the fuller read the settings screen uses now.
create function public.group_join_settings(p_group_id uuid)
returns table(searchable boolean, join_policy text, join_question text, pending_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'only the group owner can view who joins';
  end if;
  return query
    select coalesce(d.searchable, false), coalesce(d.join_policy, 'open'), d.join_question,
           (select count(*) from public.group_join_requests r
             where r.group_id = p_group_id and r.status = 'pending')
      from (select 1) as one
      left join public.group_discovery d on d.group_id = p_group_id;
end;
$$;
revoke all on function public.group_join_settings(uuid) from public, anon;
grant execute on function public.group_join_settings(uuid) to authenticated;

create function public.pending_join_requests(p_group_id uuid)
returns table(id uuid, user_id uuid, display_name text, avatar_key text,
              question text, answer text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.groups g where g.id = p_group_id and g.owner_id = auth.uid()) then
    raise exception 'only the group owner can see requests';
  end if;
  return query
    select r.id, r.user_id, p.display_name, p.avatar_key, r.question, r.answer, r.created_at
      from public.group_join_requests r
      join public.profiles p on p.id = r.user_id
     where r.group_id = p_group_id and r.status = 'pending' and not p.banned
     order by r.created_at, r.id;
end;
$$;
revoke all on function public.pending_join_requests(uuid) from public, anon;
grant execute on function public.pending_join_requests(uuid) to authenticated;

create function public.decide_join_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.group_join_requests;
  g public.groups;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_approve is null then raise exception 'approve or decline the request'; end if;
  select * into r from public.group_join_requests where id = p_request_id for update;
  if r.id is null then raise exception 'that request is gone'; end if;
  select * into g from public.groups where id = r.group_id for update;
  if g.owner_id <> auth.uid() then raise exception 'only the group owner can decide requests'; end if;
  if r.status <> 'pending' then raise exception 'that request was already decided'; end if;
  if p_approve then
    if exists (select 1 from public.profiles where id = r.user_id and banned) then
      raise exception 'that account is unavailable';
    end if;
    insert into public.group_members (group_id, user_id, role)
    values (r.group_id, r.user_id, 'member') on conflict do nothing;
  end if;
  update public.group_join_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_request_id;
end;
$$;
revoke all on function public.decide_join_request(uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;

-- ---- the applicant's side -----------------------------------------------------------
create function public.request_to_join(p_group_id uuid, p_answer text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  g        public.groups;
  d        public.group_discovery;
begin
  if v_uid is null then raise exception 'sign in to ask to join'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and not banned) then
    raise exception 'joining groups is unavailable';
  end if;
  if (select accepted_terms_at from public.profiles where id = v_uid) is null then
    raise exception 'accept the community terms first';
  end if;
  perform public.consume_rate_limit('join_request', 10, 3600);

  select * into g from public.groups where id = p_group_id for update;
  select * into d from public.group_discovery where group_id = p_group_id;
  -- One message for every closed door, so a refusal reveals nothing about why.
  if g.id is null or d.group_id is null or not d.searchable
     or exists (select 1 from public.profiles where id = g.owner_id and banned)
     or exists (select 1 from public.group_join_blocks where group_id = p_group_id and user_id = v_uid)
     or exists (select 1 from public.user_blocks b
                 where (b.blocker_id = g.owner_id and b.blocked_id = v_uid)
                    or (b.blocker_id = v_uid and b.blocked_id = g.owner_id))
     or exists (select 1 from public.banned_terms t where g.name ~* ('\m' || t.term || '\M')) then
    raise exception 'this group is not open to join';
  end if;
  if d.join_policy <> 'approval' then raise exception 'this group is open: join it directly'; end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then
    raise exception 'you are already in this group';
  end if;
  if exists (select 1 from public.group_join_requests
              where group_id = p_group_id and user_id = v_uid and status = 'pending') then
    raise exception 'you already asked; the owner will decide';
  end if;
  -- a decline holds for a week, so asking again is not a way to badger
  if exists (select 1 from public.group_join_requests
              where group_id = p_group_id and user_id = v_uid and status = 'declined'
                and decided_at > now() - interval '7 days') then
    raise exception 'you can ask this group again a week after your last request';
  end if;

  if d.join_question is null then
    v_answer := null;  -- nothing was asked, so nothing is stored
  else
    if v_answer is null then raise exception 'answer the group''s question to ask'; end if;
    -- line breaks are fine in an answer; other control characters are not
    if char_length(v_answer) > 500 or v_answer ~ '[\x00-\x09\x0B-\x1F\x7F]' then
      raise exception 'that answer is not usable';
    end if;
    if exists (select 1 from public.banned_terms t where v_answer ~* ('\m' || t.term || '\M')) then
      raise exception 'that answer contains language that is not allowed here';
    end if;
  end if;

  insert into public.group_join_requests (group_id, user_id, question, answer)
  values (p_group_id, v_uid, d.join_question, v_answer);

  perform public.push_notify(jsonb_build_object(
    'event', 'join_requested', 'group_id', p_group_id,
    'recipient_id', g.owner_id, 'actor_id', v_uid));
  return 'pending';
end;
$$;
revoke all on function public.request_to_join(uuid, text) from public, anon;
grant execute on function public.request_to_join(uuid, text) to authenticated;

create function public.withdraw_join_request(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update public.group_join_requests set status = 'withdrawn', decided_at = now()
   where group_id = p_group_id and user_id = auth.uid() and status = 'pending';
end;
$$;
revoke all on function public.withdraw_join_request(uuid) from public, anon;
grant execute on function public.withdraw_join_request(uuid) to authenticated;

-- Your own requests, for your data export: what you asked, what you answered.
create function public.my_join_requests()
returns table(group_name text, question text, answer text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.name, r.question, r.answer, r.status, r.created_at
    from public.group_join_requests r join public.groups g on g.id = r.group_id
   where r.user_id = (select auth.uid())
   order by r.created_at desc;
$$;
revoke all on function public.my_join_requests() from public, anon;
grant execute on function public.my_join_requests() to authenticated;

-- Open groups expose only an owner-approved directory entry. Existing groups
-- stay private. Joining never changes scorecard RLS or unlocks a Reveal.
create table public.group_discovery (
  group_id uuid primary key references public.groups(id) on delete cascade,
  searchable boolean not null default false,
  suggested boolean not null default false
);
create table public.onboarding_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rubric_id uuid references public.user_rubrics(id) on delete set null,
  completed_at timestamptz
);
create table public.group_join_blocks (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (group_id, user_id)
);
alter table public.group_discovery enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.group_join_blocks enable row level security;
revoke all on public.group_discovery, public.onboarding_progress, public.group_join_blocks from public, anon, authenticated;

-- Existing accounts keep their current landing page; new accounts start setup.
insert into public.onboarding_progress(user_id, completed_at)
select id, now() from public.profiles;

-- Intentionally public, read-only catalogue: no profiles, roster, chat or scores.
create function public.browse_open_groups(p_query text default '', p_suggested_only boolean default false)
returns table(id uuid, name text, taste_mode text, member_count bigint)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.taste_mode,
    (select count(*) from public.group_members m where m.group_id = g.id)
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

create function public.set_group_discoverable(p_group_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into g from public.groups where id = p_group_id for update;
  if g.id is null or g.owner_id <> auth.uid() then raise exception 'only the group owner can change discovery'; end if;
  if p_enabled is null then raise exception 'choose whether this group is searchable'; end if;
  if p_enabled and (exists(select 1 from public.profiles where id = auth.uid() and banned)
    or exists(select 1 from public.banned_terms t where g.name ~* ('\m' || t.term || '\M'))) then
    raise exception 'this group cannot be listed';
  end if;
  insert into public.group_discovery(group_id, searchable) values(p_group_id, p_enabled)
    on conflict(group_id) do update set searchable = excluded.searchable;
end;
$$;
revoke all on function public.set_group_discoverable(uuid, boolean) from public, anon;
grant execute on function public.set_group_discoverable(uuid, boolean) to authenticated;

create function public.group_discovery_settings(p_group_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'only the group owner can view discovery settings';
  end if;
  return coalesce((select searchable from public.group_discovery where group_id = p_group_id), false);
end;
$$;
revoke all on function public.group_discovery_settings(uuid) from public, anon;
grant execute on function public.group_discovery_settings(uuid) to authenticated;

create function public.remember_group_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Self-leaving allows a later rejoin. Owner removal requires an owner re-add.
  if auth.uid() is not null and auth.uid() <> old.user_id and exists(
    select 1 from public.groups where id = old.group_id and owner_id = auth.uid()
  ) then
    insert into public.group_join_blocks(group_id, user_id) values(old.group_id, old.user_id) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.remember_group_removal() from public, anon, authenticated;
create trigger remember_removed_group_member before delete on public.group_members
for each row execute function public.remember_group_removal();

create function public.join_open_group(p_group_id uuid)
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
  insert into public.group_members(group_id, user_id, role) values(p_group_id, v_uid, 'member') on conflict do nothing;
  return p_group_id;
end;
$$;
revoke all on function public.join_open_group(uuid) from public, anon;
grant execute on function public.join_open_group(uuid) to authenticated;

create function public.my_onboarding()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return (select jsonb_build_object('displayName', p.display_name,
    'completed', o.completed_at is not null, 'rubricId', r.id, 'rows', r.rows)
    from public.profiles p left join public.onboarding_progress o on o.user_id = p.id
    left join public.user_rubrics r on r.id = o.rubric_id and r.user_id = p.id
    where p.id = auth.uid());
end;
$$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

create function public.save_onboarding_rubric(p_display_name text, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; r jsonb;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  perform 1 from public.profiles where id = v_uid and not banned for update;
  if not found then raise exception 'setup is unavailable for this account'; end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 60 then raise exception 'enter a display name'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'choose your rubric categories'; end if;
  if jsonb_array_length(p_rows) not between 1 and 40 then raise exception 'choose 1 to 40 rubric categories'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'key','') !~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$'
      or jsonb_typeof(r->'label') is distinct from 'string'
      or char_length(coalesce(r->>'label','')) not between 1 and 40
      or jsonb_typeof(r->'weight') is distinct from 'number'
      or coalesce(r->>'weight','') !~ '^[0-9]{1,3}$' or (r->>'weight')::integer > 100
      or jsonb_typeof(r->'sort') is distinct from 'number'
      or coalesce(r->>'sort','') !~ '^[0-9]{1,3}$'
      or jsonb_typeof(r->'enabled') is distinct from 'boolean' then raise exception 'invalid rubric category'; end if;
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows)
    or not exists(select 1 from jsonb_array_elements(p_rows) where (value->>'enabled')::boolean and (value->>'weight')::integer > 0) then
    raise exception 'give at least one category a positive weight, without duplicate categories';
  end if;
  update public.profiles set display_name = trim(p_display_name) where id = v_uid;
  select rubric_id into v_id from public.onboarding_progress where user_id = v_uid;
  update public.user_rubrics set is_favorite = false where user_id = v_uid and is_favorite;
  if v_id is null then
    insert into public.user_rubrics(user_id,name,rows,is_favorite) values(v_uid,'My first rubric',p_rows,true)
      on conflict(user_id,name) do update set rows = excluded.rows, is_favorite = true returning id into v_id;
  else
    update public.user_rubrics set rows = p_rows, is_favorite = true where id = v_id and user_id = v_uid;
  end if;
  insert into public.onboarding_progress(user_id,rubric_id) values(v_uid,v_id)
    on conflict(user_id) do update set rubric_id = excluded.rubric_id;
  return v_id;
end;
$$;
revoke all on function public.save_onboarding_rubric(text,jsonb) from public, anon;
grant execute on function public.save_onboarding_rubric(text,jsonb) to authenticated;

create function public.complete_onboarding(p_group_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid := p_group_id;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if v_group_id is null then
    select id into v_group_id from public.browse_open_groups('', true) limit 1;
  end if;
  if v_group_id is not null then perform public.join_open_group(v_group_id); end if;
  insert into public.onboarding_progress(user_id,completed_at) values(auth.uid(),now())
    on conflict(user_id) do update set completed_at = coalesce(public.onboarding_progress.completed_at, excluded.completed_at);
end;
$$;
revoke all on function public.complete_onboarding(uuid) from public, anon;
grant execute on function public.complete_onboarding(uuid) to authenticated;

-- Per-member rubrics, mashed into the group's effective rubric.
--
-- The rubric itself becomes a group mash: every member carries their OWN
-- rubric for each group (seeded from the app default when they join), and the
-- rubric a session is scored under is the MEAN of all members' weights — a
-- category only some members carry counts as 0 for the others, so with two
-- members a solo 20 lands at an effective 10 ("the difference is split").
-- The averaging math lives client-side (src/lib/rubricCatalog.ts mashRubrics);
-- sessions keep snapshotting their resolved rubric, so history is unaffected.
--
-- member_rubrics replaces rubric_categories: existing members inherit their
-- group's current rows verbatim (effective rubric unchanged on day one).

-- =====================================================================  table
create table public.member_rubrics (
  group_id     uuid not null,
  user_id      uuid not null,
  category_key text not null check (category_key ~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$'),
  label        text not null check (char_length(label) between 1 and 40),
  weight       integer not null default 20 check (weight between 0 and 1000),
  enabled      boolean not null default true,
  sort         integer not null default 0,
  primary key (group_id, user_id, category_key),
  -- leaving the group removes the member's rubric with them
  foreign key (group_id, user_id)
    references public.group_members (group_id, user_id) on delete cascade
);
create index member_rubrics_group_id_idx on public.member_rubrics (group_id);

alter table public.member_rubrics enable row level security;

-- Rubrics are group-visible (members mash each other's), self-writable.
create policy member_rubrics_select_member on public.member_rubrics
  for select to authenticated using (public.is_group_member(group_id));
create policy member_rubrics_insert_self on public.member_rubrics
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
create policy member_rubrics_update_self on public.member_rubrics
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy member_rubrics_delete_self on public.member_rubrics
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.member_rubrics to authenticated;

-- =========================================  carry over: everyone inherits the
-- group's current rubric, so the mashed result equals today's group rubric.
insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
select gm.group_id, gm.user_id, rc.category_key, rc.label, rc.weight, rc.enabled, rc.sort
from public.group_members gm
join public.rubric_categories rc on rc.group_id = gm.group_id;

-- ==========================================  new members submit their rubric
-- Joining a group seeds the app-default rubric as the member's starting
-- submission (they can customize it afterwards). SECURITY DEFINER because the
-- insert may be performed by the group owner adding someone else.
create or replace function public.seed_member_rubric()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort) values
    (new.group_id, new.user_id, 'story', 'Story', 30, true, 0),
    (new.group_id, new.user_id, 'acting', 'Acting', 25, true, 1),
    (new.group_id, new.user_id, 'directing', 'Directing', 20, true, 2),
    (new.group_id, new.user_id, 'cinematography', 'Cinematography', 25, true, 3),
    (new.group_id, new.user_id, 'pacing', 'Pacing', 15, true, 4),
    (new.group_id, new.user_id, 'scoreSound', 'Score & Soundtrack', 15, true, 5)
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_group_member_added
  after insert on public.group_members
  for each row execute function public.seed_member_rubric();

-- New group -> owner membership only; the trigger above seeds their rubric.
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

drop table public.rubric_categories;

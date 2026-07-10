-- Dynamic rubric: groups compose their category set (base six + optional +
-- genre add-ons, see src/lib/rubricCatalog.ts) instead of a fixed five.
--
-- Three moves:
--   1. rubric_categories (key/label/weight/enabled/sort per group) replaces
--      rubric_weights and its fixed enum.
--   2. member_scores stores ratings as a jsonb map keyed by category key.
--      THE BLIND RULE IS UNTOUCHED: every policy/grant/trigger on
--      member_scores references only member_id/session_id — never the score
--      payload — so the RLS gate is byte-for-byte the same.
--   3. reveal_sessions.rubric snapshots the category set a session was scored
--      under, so history stays coherent when a group later edits its rubric
--      (and so a comedy can carry Humor while a horror carries Fear Factor).

-- ===================================================================  1. table
create table public.rubric_categories (
  group_id     uuid not null references public.groups (id) on delete cascade,
  category_key text not null check (category_key ~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$'),
  label        text not null check (char_length(label) between 1 and 40),
  weight       integer not null default 20 check (weight between 0 and 1000),
  enabled      boolean not null default true,
  sort         integer not null default 0,
  primary key (group_id, category_key)
);

alter table public.rubric_categories enable row level security;

create policy rubric_categories_select_member on public.rubric_categories
  for select to authenticated using (public.is_group_member(group_id));
create policy rubric_categories_write_owner on public.rubric_categories
  for all to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));

grant select, insert, update, delete on public.rubric_categories to authenticated;

-- Carry over each group's existing weights. Keys go camelCase to match the
-- client's category keys; Pacing/Score & Sound pick up their new labels.
insert into public.rubric_categories (group_id, category_key, label, weight, enabled, sort)
select
  group_id,
  case category::text when 'score_sound' then 'scoreSound' else category::text end,
  case category::text
    when 'story' then 'Story'
    when 'acting' then 'Acting'
    when 'cinematography' then 'Cinematography'
    when 'pacing' then 'Editing & Pacing'
    when 'score_sound' then 'Sound & Music'
  end,
  weight,
  true,
  case category::text
    when 'story' then 0
    when 'acting' then 1
    when 'cinematography' then 3
    when 'pacing' then 4
    when 'score_sound' then 5
  end
from public.rubric_weights;

-- ==============================================  2. session rubric snapshots
alter table public.reveal_sessions add column rubric jsonb;

-- Backfill existing sessions from the categories they were ACTUALLY scored
-- under (the original five) — before Directing is introduced below.
update public.reveal_sessions rs
set rubric = (
  select jsonb_agg(
           jsonb_build_object('key', rc.category_key, 'label', rc.label, 'weight', rc.weight)
           order by rc.sort)
  from public.rubric_categories rc
  where rc.group_id = rs.group_id and rc.enabled
);

-- Now every existing group gains the sixth base category, Directing.
insert into public.rubric_categories (group_id, category_key, label, weight, enabled, sort)
select id, 'directing', 'Directing', 20, true, 2 from public.groups
on conflict do nothing;

drop table public.rubric_weights;
drop type public.category_id;

-- ==========================================  3. member_scores -> jsonb scores
alter table public.member_scores add column scores jsonb not null default '{}'::jsonb;

update public.member_scores set scores = jsonb_build_object(
  'story', story,
  'acting', acting,
  'cinematography', cinematography,
  'pacing', pacing,
  'scoreSound', score_sound
);

alter table public.member_scores
  drop column story,
  drop column acting,
  drop column cinematography,
  drop column pacing,
  drop column score_sound;

alter table public.member_scores
  add constraint member_scores_scores_object check (jsonb_typeof(scores) = 'object');

-- ============================================================  4. group seed
-- New groups seed the base six (was: five enum rows into rubric_weights).
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.rubric_categories (group_id, category_key, label, weight, enabled, sort) values
    (new.id, 'story', 'Story', 20, true, 0),
    (new.id, 'acting', 'Acting', 20, true, 1),
    (new.id, 'directing', 'Directing', 20, true, 2),
    (new.id, 'cinematography', 'Cinematography', 20, true, 3),
    (new.id, 'pacing', 'Editing & Pacing', 20, true, 4),
    (new.id, 'scoreSound', 'Sound & Music', 20, true, 5);
  return new;
end;
$$;

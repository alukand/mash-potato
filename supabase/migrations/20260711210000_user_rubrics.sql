-- Personal rubric presets. A user saves named rubrics app-wide, stars ONE as
-- their favorite, and applies any of them when editing their rubric in a
-- group. The favorite is also what a user "submits" when they join or create
-- a group (seed_member_rubric prefers it over the app default).

create table public.user_rubrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  rows        jsonb not null check (jsonb_typeof(rows) = 'array'),
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index user_rubrics_user_id_idx on public.user_rubrics (user_id);
-- at most one favorite per user
create unique index user_rubrics_one_favorite on public.user_rubrics (user_id)
  where is_favorite;

alter table public.user_rubrics enable row level security;

create policy user_rubrics_select_self on public.user_rubrics
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_rubrics_insert_self on public.user_rubrics
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_rubrics_update_self on public.user_rubrics
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_rubrics_delete_self on public.user_rubrics
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_rubrics to authenticated;

create trigger user_rubrics_touch_updated_at
  before update on public.user_rubrics
  for each row execute function public.touch_updated_at();

-- Joining a group now submits your FAVORITE rubric when you have one;
-- otherwise the app default. Values are clamped to the member_rubrics checks.
create or replace function public.seed_member_rubric()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fav jsonb;
  inserted integer := 0;
begin
  select ur.rows into fav
  from public.user_rubrics ur
  where ur.user_id = new.user_id and ur.is_favorite
  limit 1;

  if fav is not null then
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
    select
      new.group_id,
      new.user_id,
      r->>'key',
      left(coalesce(nullif(r->>'label', ''), r->>'key'), 40),
      least(1000, greatest(0, coalesce((r->>'weight')::integer, 20))),
      coalesce((r->>'enabled')::boolean, true),
      coalesce((r->>'sort')::integer, 0)
    from jsonb_array_elements(fav) as r
    where r->>'key' ~ '^[a-zA-Z][a-zA-Z0-9]{0,39}$'
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted > 0 then
      return new;
    end if;
  end if;

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

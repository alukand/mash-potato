-- Default rubric + global (community) ratings.
--
--  1. Rename two base categories (Editing & Pacing -> Pacing, Sound & Music ->
--     Score & Soundtrack) and give new groups the weighted DEFAULT rubric
--     (story/acting/cinematography above pacing/score). Keep in sync with
--     src/lib/rubricCatalog.ts DEFAULT_WEIGHTS.
--  2. global_ratings: a solo/community rating per (user, title) using the
--     default rubric. Self-only RLS (you read/write only your own), so nobody
--     browses another person's raw solo scores.
--  3. title_community_score(): a SECURITY DEFINER aggregate that reads across
--     ALL users' global ratings but returns ONLY the count + weighted mean —
--     the "everyone in one big group" score, without exposing individual rows.

-- =================================================  1. renames + default seed
update public.rubric_categories set label = 'Pacing'
  where category_key = 'pacing' and label = 'Editing & Pacing';
update public.rubric_categories set label = 'Score & Soundtrack'
  where category_key = 'scoreSound' and label = 'Sound & Music';

create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  -- The weighted DEFAULT rubric (not flat 20s).
  insert into public.rubric_categories (group_id, category_key, label, weight, enabled, sort) values
    (new.id, 'story', 'Story', 30, true, 0),
    (new.id, 'acting', 'Acting', 25, true, 1),
    (new.id, 'directing', 'Directing', 20, true, 2),
    (new.id, 'cinematography', 'Cinematography', 25, true, 3),
    (new.id, 'pacing', 'Pacing', 15, true, 4),
    (new.id, 'scoreSound', 'Score & Soundtrack', 15, true, 5);
  return new;
end;
$$;

-- =====================================================  2. global_ratings
create table public.global_ratings (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  scores     jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id),
  constraint global_ratings_scores_object check (jsonb_typeof(scores) = 'object')
);
create index global_ratings_title_id_idx on public.global_ratings (title_id);

alter table public.global_ratings enable row level security;

-- Self-only: a member reads, writes, and removes only their own solo rating.
-- The community aggregate is exposed only through the SECURITY DEFINER fn below.
create policy global_ratings_select_self on public.global_ratings
  for select to authenticated using (user_id = (select auth.uid()));
create policy global_ratings_insert_self on public.global_ratings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy global_ratings_update_self on public.global_ratings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy global_ratings_delete_self on public.global_ratings
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.global_ratings to authenticated;

create trigger global_ratings_touch_updated_at
  before update on public.global_ratings
  for each row execute function public.touch_updated_at();

-- =====================================================  3. community aggregate
-- Weighted mean across EVERY user's rating of the title. SECURITY DEFINER so it
-- can read past the self-only RLS, but it returns only (count, mean) — never a
-- single member's scores. Weights come from the caller (the client's default
-- rubric), so the math stays in one place.
create or replace function public.title_community_score(p_title_id uuid, p_weights jsonb)
returns table (rating_count integer, mashed numeric)
language sql security definer set search_path = '' stable as $$
  select
    count(w.value)::integer,
    avg(w.value)
  from public.global_ratings gr
  cross join lateral (
    select sum((gr.scores->>k)::numeric * (p_weights->>k)::numeric)
           / nullif(sum((p_weights->>k)::numeric), 0) as value
    from jsonb_object_keys(p_weights) as k
    where gr.scores ? k
  ) w
  where gr.title_id = p_title_id;
$$;

revoke execute on function public.title_community_score(uuid, jsonb) from public;
grant execute on function public.title_community_score(uuid, jsonb) to authenticated;

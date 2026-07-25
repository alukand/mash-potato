-- Taste modes: two scoring styles, one community.
--
--   casual  ("Normies" in the UI)     Enjoyment 50, Acting 25, Writing 25
--   buff    ("Cinephiles" in the UI)  the base-seven craft rubric
--
-- The schema stores neutral values so display names stay a client concern.
-- Every title shows BOTH crowds' numbers: the aggregate functions bucket
-- raters by their CURRENT mode and score each rater under their own mode's
-- weights (your ratings follow you when you switch sides). Individual rows
-- stay self-only; these are the same count-plus-mean shape as
-- title_community_score.

-- ---- profiles.taste_mode ---------------------------------------------------
-- New accounts default casual (the bigger tent; onboarding confirms the
-- choice explicitly). Existing accounts built their habits on the full
-- rubric, so the backfill keeps them buffs and nothing changes under them.

alter table public.profiles
  add column taste_mode text not null default 'casual'
    check (taste_mode in ('casual', 'buff'));

update public.profiles set taste_mode = 'buff';

-- taste_mode joins display_name and avatar_key as self-editable (the RLS
-- update policy already scopes writes to your own row).
grant update (taste_mode) on public.profiles to authenticated;

-- ---- per-mode community aggregates ----------------------------------------

create or replace function public.title_mode_scores(
  p_title_id uuid,
  p_casual_weights jsonb,
  p_buff_weights jsonb
)
returns table (mode text, rating_count integer, mashed numeric)
language sql security definer set search_path = '' stable as $$
  select
    pr.taste_mode,
    count(w.value)::integer,
    avg(w.value)
  from public.global_ratings gr
  join public.profiles pr on pr.id = gr.user_id
  cross join lateral (
    select case when pr.taste_mode = 'casual' then p_casual_weights
                else p_buff_weights end as wts
  ) mw
  cross join lateral (
    select sum((gr.scores->>k)::numeric * (mw.wts->>k)::numeric)
           / nullif(sum((mw.wts->>k)::numeric), 0) as value
    from jsonb_object_keys(mw.wts) as k
    where gr.scores ? k
  ) w
  where gr.title_id = p_title_id
  group by pr.taste_mode;
$$;

revoke execute on function public.title_mode_scores(uuid, jsonb, jsonb) from public;
grant execute on function public.title_mode_scores(uuid, jsonb, jsonb) to authenticated;

-- Distribution with an optional mode filter: null spans everyone, with each
-- rater still scored under their own mode's weights.
create or replace function public.title_mode_histogram(
  p_title_id uuid,
  p_casual_weights jsonb,
  p_buff_weights jsonb,
  p_mode text default null
)
returns table (bucket integer, n integer)
language sql security definer set search_path = '' stable as $$
  select
    greatest(1, least(10, round(w.value)::integer)) as bucket,
    count(*)::integer as n
  from public.global_ratings gr
  join public.profiles pr on pr.id = gr.user_id
  cross join lateral (
    select case when pr.taste_mode = 'casual' then p_casual_weights
                else p_buff_weights end as wts
  ) mw
  cross join lateral (
    select sum((gr.scores->>k)::numeric * (mw.wts->>k)::numeric)
           / nullif(sum((mw.wts->>k)::numeric), 0) as value
    from jsonb_object_keys(mw.wts) as k
    where gr.scores ? k
  ) w
  where gr.title_id = p_title_id
    and (p_mode is null or pr.taste_mode = p_mode)
    and w.value is not null
  group by 1
  order by 1;
$$;

revoke execute on function public.title_mode_histogram(uuid, jsonb, jsonb, text) from public;
grant execute on function public.title_mode_histogram(uuid, jsonb, jsonb, text) to authenticated;

-- ---- mode-aware member-rubric seeding -------------------------------------
-- A ★ preset still wins verbatim. The coverage union and the no-preset
-- fallback now follow the member's mode: buffs get the base seven, casuals
-- get their three-part core (Enjoyment heaviest). "Your mode's core is
-- always on your card" replaces "the base set is always on your card";
-- a preset that carries a core category DISABLED still keeps that choice.
-- Values mirror src/lib/rubricCatalog.ts (keep in sync).

create or replace function public.seed_member_rubric()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fav jsonb;
  inserted integer := 0;
  v_mode text;
begin
  select taste_mode into v_mode from public.profiles where id = new.user_id;
  v_mode := coalesce(v_mode, 'buff');

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
      -- Mode-core coverage: whatever core categories the preset skipped join
      -- at their defaults, sorted after the preset's own rows.
      insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
      select
        new.group_id,
        new.user_id,
        b.key,
        b.label,
        b.weight,
        true,
        coalesce((select max(mr2.sort)
                  from public.member_rubrics mr2
                  where mr2.group_id = new.group_id and mr2.user_id = new.user_id), -1) + b.ord
      from (
        select * from (values
          ('buff', 'story',           'Story',              30, 1),
          ('buff', 'acting',          'Acting',             25, 2),
          ('buff', 'writing',         'Writing',            20, 3),
          ('buff', 'cinematography',  'Cinematography',     25, 4),
          ('buff', 'pacing',          'Pacing',             15, 5),
          ('buff', 'scoreSound',      'Score & Soundtrack', 15, 6),
          ('buff', 'emotionalImpact', 'Emotional Impact',   25, 7),
          ('casual', 'enjoyment',     'Enjoyment',          50, 1),
          ('casual', 'acting',        'Acting',             25, 2),
          ('casual', 'writing',       'Writing',            25, 3)
        ) as t(mode, key, label, weight, ord)
        where t.mode = v_mode
      ) as b
      where not exists (
        select 1 from public.member_rubrics mr
        where mr.group_id = new.group_id
          and mr.user_id = new.user_id
          and mr.category_key = b.key)
      on conflict do nothing;
      return new;
    end if;
  end if;

  if v_mode = 'casual' then
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort) values
      (new.group_id, new.user_id, 'enjoyment', 'Enjoyment', 50, true, 0),
      (new.group_id, new.user_id, 'acting', 'Acting', 25, true, 1),
      (new.group_id, new.user_id, 'writing', 'Writing', 25, true, 2)
    on conflict do nothing;
  else
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort) values
      (new.group_id, new.user_id, 'story', 'Story', 30, true, 0),
      (new.group_id, new.user_id, 'acting', 'Acting', 25, true, 1),
      (new.group_id, new.user_id, 'writing', 'Writing', 20, true, 2),
      (new.group_id, new.user_id, 'cinematography', 'Cinematography', 25, true, 3),
      (new.group_id, new.user_id, 'pacing', 'Pacing', 15, true, 4),
      (new.group_id, new.user_id, 'scoreSound', 'Score & Soundtrack', 15, true, 5),
      (new.group_id, new.user_id, 'emotionalImpact', 'Emotional Impact', 25, true, 6)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Group taste modes: one group, one rubric.
--
-- profiles.taste_mode (20260718150000) governs SOLO ratings and which
-- community bucket you land in. It must not govern group rounds: mashRubrics
-- averages every member's rubric counting 0 for non-carriers, so one casual
-- member in a buff group diluted Enjoyment from 50 to 12.5 — the lightest
-- slider on the very card whose mode exists to make it the heaviest.
--
-- The mode is now a property of the GROUP for rounds:
--   casual ("Normies")     Enjoyment 50 / Acting 25 / Writing 25, for everyone
--   buff   ("Cinephiles")  the base-seven craft rubric, per-member as before
--
-- Genre add-ons still resolve on top in both modes (a comedy night still
-- carries Humor); they need no configuration, so they cost casual groups
-- nothing in simplicity.

-- ---- groups.taste_mode -----------------------------------------------------
-- Defaulting to 'buff' backfills every existing group to today's exact
-- behavior, so nothing changes under any group that already has history.

alter table public.groups
  add column taste_mode text not null default 'buff'
    check (taste_mode in ('casual', 'buff'));

-- ---- seeding follows the GROUP's mode --------------------------------------
-- Casual groups are a no-configuration surface: the group's three rows are the
-- rubric, so the personal ★ preset and the base-coverage union are skipped
-- entirely. Buff groups keep the existing behavior verbatim (preset wins, then
-- base-seven coverage, else the base-seven fallback).
-- Values mirror src/lib/rubricCatalog.ts (keep in sync).

create or replace function public.seed_member_rubric()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fav jsonb;
  inserted integer := 0;
  v_mode text;
begin
  select g.taste_mode into v_mode from public.groups g where g.id = new.group_id;
  v_mode := coalesce(v_mode, 'buff');

  if v_mode = 'casual' then
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort) values
      (new.group_id, new.user_id, 'enjoyment', 'Enjoyment', 50, true, 0),
      (new.group_id, new.user_id, 'acting', 'Acting', 25, true, 1),
      (new.group_id, new.user_id, 'writing', 'Writing', 25, true, 2)
    on conflict do nothing;
    return new;
  end if;

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
      -- Base coverage: whatever base categories the preset skipped join at
      -- their defaults, sorted after the preset's own rows.
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
      from (values
        ('story',           'Story',              30, 1),
        ('acting',          'Acting',             25, 2),
        ('writing',         'Writing',            20, 3),
        ('cinematography',  'Cinematography',     25, 4),
        ('pacing',          'Pacing',             15, 5),
        ('scoreSound',      'Score & Soundtrack', 15, 6),
        ('emotionalImpact', 'Emotional Impact',   25, 7)
      ) as b(key, label, weight, ord)
      where not exists (
        select 1 from public.member_rubrics mr
        where mr.group_id = new.group_id
          and mr.user_id = new.user_id
          and mr.category_key = b.key)
      on conflict do nothing;
      return new;
    end if;
  end if;

  insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort) values
    (new.group_id, new.user_id, 'story', 'Story', 30, true, 0),
    (new.group_id, new.user_id, 'acting', 'Acting', 25, true, 1),
    (new.group_id, new.user_id, 'writing', 'Writing', 20, true, 2),
    (new.group_id, new.user_id, 'cinematography', 'Cinematography', 25, true, 3),
    (new.group_id, new.user_id, 'pacing', 'Pacing', 15, true, 4),
    (new.group_id, new.user_id, 'scoreSound', 'Score & Soundtrack', 15, true, 5),
    (new.group_id, new.user_id, 'emotionalImpact', 'Emotional Impact', 25, true, 6)
  on conflict do nothing;
  return new;
end;
$$;

-- ---- switching a group's mode re-seeds everyone ----------------------------
-- member_rubrics writes are self-only by RLS, so an owner cannot rewrite other
-- members' rows directly. This lives on the COLUMN rather than in an RPC so
-- there is no path that changes the mode without re-seeding: any update that
-- the groups_update_owner policy admits triggers it.
--
-- Locked scores and past rounds are untouched — every session carries its own
-- rubric snapshot, so history stays coherent. What is lost, deliberately, is
-- tuned per-member weights for this group (the UI confirms before switching).

create or replace function public.reseed_group_rubrics()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_rubrics where group_id = new.id;

  if new.taste_mode = 'casual' then
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
    select new.id, gm.user_id, b.key, b.label, b.weight, true, b.ord
    from public.group_members gm
    cross join (values
      ('enjoyment', 'Enjoyment', 50, 0),
      ('acting',    'Acting',    25, 1),
      ('writing',   'Writing',   25, 2)
    ) as b(key, label, weight, ord)
    where gm.group_id = new.id
    on conflict do nothing;
  else
    insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
    select new.id, gm.user_id, b.key, b.label, b.weight, true, b.ord
    from public.group_members gm
    cross join (values
      ('story',           'Story',              30, 0),
      ('acting',          'Acting',             25, 1),
      ('writing',         'Writing',            20, 2),
      ('cinematography',  'Cinematography',     25, 3),
      ('pacing',          'Pacing',             15, 4),
      ('scoreSound',      'Score & Soundtrack', 15, 5),
      ('emotionalImpact', 'Emotional Impact',   25, 6)
    ) as b(key, label, weight, ord)
    where gm.group_id = new.id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Trigger internal: never a client API, so it is sealed from every API role.
-- `revoke ... from public` alone is NOT enough — authenticated carries its own
-- grant from before the hardening migration's default-privilege change, so it
-- has to be named (same shape as 20260717160000's v_internal loop).
revoke all on function public.reseed_group_rubrics() from public, anon, authenticated;

create trigger on_group_taste_mode_changed
  after update of taste_mode on public.groups
  for each row when (old.taste_mode is distinct from new.taste_mode)
  execute function public.reseed_group_rubrics();

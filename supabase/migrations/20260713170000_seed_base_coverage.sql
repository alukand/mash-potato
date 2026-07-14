-- seed_member_rubric: a ★ preset now gets base-seven coverage. A preset saved
-- before Emotional Impact joined the base set (or before any future base
-- change) copies verbatim and then any base category it LACKS joins at the
-- default weight — otherwise the member has no row, the editor never offers
-- it, and mashRubrics silently counts them as 0 against the whole group.
-- A preset that carries a base category DISABLED keeps that deliberate
-- choice: the row exists, so the union skips it.
-- Base values mirror src/lib/rubricCatalog.ts (keep in sync).

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

-- Repair pass: members already seeded from a base-six preset (post-backfill
-- joins on hosted) gain their missing base rows the same way.
insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
select
  gm.group_id,
  gm.user_id,
  b.key,
  b.label,
  b.weight,
  true,
  coalesce((select max(mr2.sort)
            from public.member_rubrics mr2
            where mr2.group_id = gm.group_id and mr2.user_id = gm.user_id), -1) + b.ord
from public.group_members gm
cross join (values
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
  where mr.group_id = gm.group_id
    and mr.user_id = gm.user_id
    and mr.category_key = b.key)
on conflict do nothing;

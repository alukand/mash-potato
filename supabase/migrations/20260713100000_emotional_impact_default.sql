-- Default rubric change: Emotional Impact joins the base seven at its own
-- deliberate weight (25). "Did it land" moves people more than craft
-- line-items, for every genre. Keep in sync with src/lib/rubricCatalog.ts
-- (which also makes Humor / Fear Factor HEAVY genre add-ons at 35 — that part
-- lives in the client's published genre table; session snapshots carry it).

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
    (new.group_id, new.user_id, 'writing', 'Writing', 20, true, 2),
    (new.group_id, new.user_id, 'cinematography', 'Cinematography', 25, true, 3),
    (new.group_id, new.user_id, 'pacing', 'Pacing', 15, true, 4),
    (new.group_id, new.user_id, 'scoreSound', 'Score & Soundtrack', 15, true, 5),
    (new.group_id, new.user_id, 'emotionalImpact', 'Emotional Impact', 25, true, 6)
  on conflict do nothing;
  return new;
end;
$$;

-- Existing members inherit Emotional Impact too (default change, not a per
-- member choice) — but anyone who ALREADY configured it, enabled or disabled,
-- keeps their own setting.
insert into public.member_rubrics (group_id, user_id, category_key, label, weight, enabled, sort)
select
  gm.group_id,
  gm.user_id,
  'emotionalImpact',
  'Emotional Impact',
  25,
  true,
  coalesce((select max(mr2.sort) + 1
            from public.member_rubrics mr2
            where mr2.group_id = gm.group_id and mr2.user_id = gm.user_id), 6)
from public.group_members gm
where not exists (
  select 1 from public.member_rubrics mr
  where mr.group_id = gm.group_id
    and mr.user_id = gm.user_id
    and mr.category_key = 'emotionalImpact')
on conflict do nothing;

-- Default rubric change: Writing replaces Directing in the base six.
-- Directing stays in the catalog as an optional add-on (client-side list).
-- Existing member rubrics are deliberately untouched — anyone can toggle
-- Directing off / add Writing, or hit "Reset to the default rubric" which now
-- includes Writing. Keep in sync with src/lib/rubricCatalog.ts.

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
    (new.group_id, new.user_id, 'scoreSound', 'Score & Soundtrack', 15, true, 5)
  on conflict do nothing;
  return new;
end;
$$;

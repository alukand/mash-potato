-- Personal playlists now default to PUBLIC (owner decision 2026-07-16),
-- completing the public-by-default profile: name, avatar, groups, and
-- playlists all show unless the user hides them. The per-list visibility
-- toggle stays; ratings/reviewed/saved remain private always.
--
-- Group watchlists are unaffected: they can never be public (the existing
-- check constraint), so an insert trigger pins them private rather than
-- letting the new column default trip the constraint.

alter table public.playlists alter column is_public set default true;

create or replace function public.playlists_force_group_private()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.group_id is not null then
    new.is_public := false;
  end if;
  return new;
end;
$$;
create trigger playlists_group_private
  before insert on public.playlists
  for each row execute function public.playlists_force_group_private();

-- Existing personal playlists go public too (same treatment as group
-- memberships on 2026-07-14); owners can flip any list back.
update public.playlists set is_public = true where group_id is null;

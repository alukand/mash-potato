-- Public profiles + playlists.
--
-- Privacy model, private by default in every direction:
--   * A member chooses PER GROUP whether that membership shows on their
--     public profile (group_members.is_public, default false).
--   * Playlists are private until their owner flips is_public.
--   * Solo ratings / reviewed / saved stay private always — sharing taste
--     happens through playlists the user curates, never automatically.
--
-- The public profile is served by ONE definer RPC (public_profile) instead of
-- loosening groups/group_members policies: the exposed shape is exactly what
-- the function builds, nothing more.

-- ==================== 1. per-group profile visibility =======================
alter table public.group_members
  add column is_public boolean not null default false;

-- Members flip their OWN row only (an RPC rather than an UPDATE policy, so
-- the role column can never be touched through this path).
create or replace function public.set_group_visibility(p_group_id uuid, p_public boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.group_members
    set is_public = coalesce(p_public, false)
    where group_id = p_group_id and user_id = (select auth.uid());
  if not found then
    raise exception 'not a member of this group';
  end if;
end;
$$;

revoke execute on function public.set_group_visibility(uuid, boolean) from public;
grant execute on function public.set_group_visibility(uuid, boolean) to authenticated;

-- ============================ 2. playlists ===================================
create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 240),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index playlists_owner_id_idx on public.playlists (owner_id);

create trigger playlists_touch_updated_at
  before update on public.playlists
  for each row execute function public.touch_updated_at();

create table public.playlist_items (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  title_id    uuid not null references public.titles (id) on delete restrict,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, title_id)
);

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;

-- Playlists: yours, or anyone's public ones.
create policy playlists_select_own_or_public on public.playlists
  for select to authenticated
  using (owner_id = (select auth.uid()) or is_public);
create policy playlists_insert_own on public.playlists
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy playlists_update_own on public.playlists
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy playlists_delete_own on public.playlists
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Items ride their playlist's visibility (the subquery runs under the
-- playlists policies above: visible playlist = visible items). Writes are
-- owner-only.
create policy playlist_items_select_visible on public.playlist_items
  for select to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id));
create policy playlist_items_insert_own on public.playlist_items
  for insert to authenticated
  with check (exists (
    select 1 from public.playlists p
    where p.id = playlist_id and p.owner_id = (select auth.uid())));
create policy playlist_items_delete_own on public.playlist_items
  for delete to authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_id and p.owner_id = (select auth.uid())));

grant select, insert, update, delete on public.playlists to authenticated;
grant select, insert, delete on public.playlist_items to authenticated;
revoke update on public.playlist_items from authenticated;

-- ========================= 3. the public profile ============================
-- Everything another signed-in user may see about you, in one controlled
-- shape: display name, the groups you chose to show, your public playlists.
create or replace function public.public_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'displayName',
      (select display_name from public.profiles where id = p_user_id),
    'groups', coalesce(
      (select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name)
                        order by gm.joined_at)
       from public.group_members gm
       join public.groups g on g.id = gm.group_id
       where gm.user_id = p_user_id and gm.is_public),
      '[]'::jsonb),
    'playlists', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'description', p.description,
                'itemCount',
                  (select count(*) from public.playlist_items pi
                   where pi.playlist_id = p.id),
                'posters',
                  coalesce((select jsonb_agg(x.poster_path)
                    from (select t.poster_path
                          from public.playlist_items pi
                          join public.titles t on t.id = pi.title_id
                          where pi.playlist_id = p.id
                            and t.poster_path is not null
                          order by pi.added_at desc
                          limit 3) x), '[]'::jsonb))
              order by p.updated_at desc)
       from public.playlists p
       where p.owner_id = p_user_id and p.is_public),
      '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to authenticated;

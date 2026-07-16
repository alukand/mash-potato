-- Group watchlists + profiles default to PUBLIC.
--
-- 1. A playlist may belong to a GROUP (group_id set): every member reads it
--    and adds/removes titles; the creator or the group owner renames or
--    deletes it. Group lists are never public — they live and die with the
--    group. Personal playlists (group_id null) work exactly as before.
-- 2. Privacy-model change (owner decision 2026-07-14): group memberships now
--    show on public profiles BY DEFAULT. Members can still hide any group
--    via the existing per-group toggle; playlists and ratings remain opt-in.

-- ==================== 1. group watchlists ====================================

alter table public.playlists
  add column group_id uuid references public.groups (id) on delete cascade,
  add constraint playlists_group_never_public
    check (group_id is null or not is_public);
create index playlists_group_id_idx on public.playlists (group_id);

-- Reads: yours, anyone's public ones, or your groups' watchlists.
drop policy playlists_select_own_or_public on public.playlists;
create policy playlists_select_own_public_or_group on public.playlists
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or is_public
    or (group_id is not null and public.is_group_member(group_id))
  );

-- Creating: always as yourself; a group list needs membership.
drop policy playlists_insert_own on public.playlists;
create policy playlists_insert_own_or_group on public.playlists
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (group_id is null or public.is_group_member(group_id))
  );

-- Managing (rename / delete): the creator, or the group owner for group lists.
drop policy playlists_update_own on public.playlists;
create policy playlists_update_own_or_group_owner on public.playlists
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_owner(group_id))
  )
  with check (
    owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_owner(group_id))
  );
drop policy playlists_delete_own on public.playlists;
create policy playlists_delete_own_or_group_owner on public.playlists
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (group_id is not null and public.is_group_owner(group_id))
  );

-- Items: any member curates a group watchlist; personal lists stay owner-only.
drop policy playlist_items_insert_own on public.playlist_items;
create policy playlist_items_insert_owner_or_member on public.playlist_items
  for insert to authenticated
  with check (exists (
    select 1 from public.playlists p
    where p.id = playlist_id
      and (p.owner_id = (select auth.uid())
           or (p.group_id is not null and public.is_group_member(p.group_id)))));
drop policy playlist_items_delete_own on public.playlist_items;
create policy playlist_items_delete_owner_or_member on public.playlist_items
  for delete to authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_id
      and (p.owner_id = (select auth.uid())
           or (p.group_id is not null and public.is_group_member(p.group_id)))));

-- Public profiles list PERSONAL public playlists only (group lists are the
-- group's business). Re-created with the group guard; shape otherwise as in
-- 20260714150000.
create or replace function public.public_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'displayName',
      (select display_name from public.profiles where id = p_user_id),
    'avatarKey',
      (select avatar_key from public.profiles where id = p_user_id),
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
       where p.owner_id = p_user_id and p.is_public and p.group_id is null),
      '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to authenticated;

-- ==================== 2. profiles default to public ==========================

alter table public.group_members alter column is_public set default true;
update public.group_members set is_public = true;

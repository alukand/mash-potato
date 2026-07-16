-- Profile avatars: a picked key into the app's ORIGINAL movie-archetype
-- avatar catalog (src/components/avatars.tsx). Null = the classic initial
-- circle. Keys only — artwork ships in the client, never in the DB, and no
-- copyrighted character imagery exists anywhere (App Review 5.2).

alter table public.profiles
  add column avatar_key text
    check (avatar_key is null or avatar_key ~ '^[a-z][a-zA-Z0-9]{0,39}$');

-- The update grant is column-narrowed (banned stays dashboard-only);
-- avatar_key joins display_name as self-editable.
grant update (avatar_key) on public.profiles to authenticated;

-- Public profiles carry the avatar too (it is the least private thing shown).
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
       where p.owner_id = p_user_id and p.is_public),
      '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to authenticated;

-- Self-serve account deletion (App Review 5.1.1(v): apps with account
-- creation must offer in-app account deletion).
--
-- Groups the deleter OWNS: ownership transfers to the longest-standing
-- other member (their group, its history, and reveals live on); groups
-- where the deleter was the only member are deleted outright.
-- groups.owner_id is ON DELETE RESTRICT, so this handoff must happen
-- before the auth.users delete; everything else rides the cascades
-- (profiles -> member_scores / member_rubrics / comments / reactions /
-- playlists / device_tokens / rsvps / blocks / reports / global_ratings;
-- reveal_sessions.created_by is SET NULL so past reveals survive).
--
-- NOTE: deleting the auth user revokes refresh tokens but does NOT
-- invalidate the current access token (JWT) — the client signs out
-- immediately after calling this. A stale token maps to a uid with no
-- rows anywhere, so RLS returns nothing for it.

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_group record;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  for v_group in
    select g.id from public.groups g where g.owner_id = v_uid
  loop
    select gm.user_id into v_heir
    from public.group_members gm
    where gm.group_id = v_group.id and gm.user_id <> v_uid
    order by gm.joined_at asc, gm.user_id asc
    limit 1;

    if v_heir is null then
      delete from public.groups where id = v_group.id;
    else
      update public.groups set owner_id = v_heir where id = v_group.id;
      update public.group_members set role = 'owner'
        where group_id = v_group.id and user_id = v_heir;
    end if;
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

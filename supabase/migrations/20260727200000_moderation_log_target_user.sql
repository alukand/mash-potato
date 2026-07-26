-- moderation_log gains target_user_id, so a ban can be lifted from the log.
--
-- Found while documenting the queue, which is a good argument for writing the
-- runbook before shipping. Banning happens two ways and they record
-- differently:
--
--   resolve_report(..., 'ban')  -> target_kind 'comment' | 'message'
--                                  target_id  = the CONTENT
--   set_user_banned(id, true)   -> target_kind 'user'
--                                  target_id  = the PERSON
--
-- The screen's "Lift ban" only appeared for target_kind 'user', so the common
-- path — banning someone from the report queue — produced a row with no way
-- back. Worse, the only UI that called `set_user_banned` WAS that button, so
-- the dead end was circular: the app could ban but never unban.
--
-- `target_user_id` was recorded correctly all along (both writers set it);
-- the log just never returned it. Adding it to the projection is the whole
-- fix. A return type cannot be changed by `create or replace`, so this drops
-- and recreates — grants must be re-issued, which is why they are repeated
-- below rather than assumed to survive.

drop function if exists public.moderation_log(integer);

create function public.moderation_log(p_limit integer default 50)
returns table (
  action text, target_kind text, target_id uuid,
  target_user_id uuid,
  moderator_name text, target_name text, note text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'not a moderator';
  end if;
  return query
  select a.action, a.target_kind, a.target_id,
         a.target_user_id,
         m.display_name, t.display_name, a.note, a.created_at
    from public.moderation_actions a
    left join public.profiles m on m.id = a.moderator_id
    left join public.profiles t on t.id = a.target_user_id
   order by a.created_at desc
   limit greatest(1, least(p_limit, 200));
end;
$$;

revoke all on function public.moderation_log(integer) from public, anon;
grant execute on function public.moderation_log(integer) to authenticated;

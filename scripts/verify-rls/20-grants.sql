-- The table/function grants the Supabase platform applies to API roles.
-- On a real project these exist as default privileges; RLS (not grants) is
-- what actually restricts row access — which is exactly what we're testing.
-- Run AFTER the migration.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Re-apply the deliberate exceptions (the blanket grant above would otherwise
-- undo migrations' explicit revokes; on real Supabase no such re-grant runs).
revoke all on public.notification_config from authenticated, anon;
revoke insert, update on public.device_tokens from authenticated;
-- discussion: comment writes exist only via the definer RPCs; the wordlist
-- is definer-only; the ban switch is dashboard-only (display_name stays
-- self-editable).
revoke insert, update, delete on public.title_comments from authenticated;
revoke update, delete on public.comment_reports from authenticated;
revoke update on public.user_blocks from authenticated;
revoke all on public.banned_terms from authenticated, anon;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_key, taste_mode) on public.profiles to authenticated;
-- security hardening: trigger-only internals are not an API, even signed in
-- (mirrors 20260717160000_security_hardening.sql, which the blanket function
-- grant above would otherwise undo).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'handle_new_user', 'handle_new_group', 'seed_member_rubric',
      'touch_updated_at', 'prevent_unreveal', 'auto_hide_reported',
      'notify_session_created', 'notify_scores_locked',
      'notify_group_member_added', 'notify_comment_reply', 'push_notify'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

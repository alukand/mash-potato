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
grant update (display_name) on public.profiles to authenticated;

-- The table/function grants the Supabase platform applies to API roles.
-- On a real project these exist as default privileges; RLS (not grants) is
-- what actually restricts row access — which is exactly what we're testing.
-- Run AFTER the migration.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- HOSTED grants anon these too, and this file did not — which is why anon
-- held INSERT/UPDATE/DELETE/TRUNCATE on all 21 tables in production while the
-- twin showed a clean posture (found 2026-07-27, closed by 20260727190000).
-- Simulating them here is what makes that migration's revoke testable.
grant select, insert, update, delete on all tables in schema public to anon;

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
-- launch hardening (20260727120000): titles takes no direct client writes, the
-- rate-limit ledger is definer-only, and profiles stops handing out `banned`.
-- The profiles pair must stay in this order: a column revoke is a no-op while
-- a table-level SELECT grant stands.
revoke insert, update, delete on public.titles from authenticated;
revoke all on public.rate_limits from authenticated, anon;
revoke select on public.profiles from authenticated, anon;
grant select (id, display_name, avatar_key, taste_mode, accepted_terms_at)
  on public.profiles to authenticated;
-- messaging: every write is a definer RPC, so no table takes direct writes.
revoke insert, update, delete on public.conversations             from authenticated;
revoke insert, update, delete on public.conversation_participants from authenticated;
revoke insert, update, delete on public.conversation_state        from authenticated;
revoke insert, update, delete on public.messages                  from authenticated;
revoke insert, update, delete on public.message_reactions         from authenticated;
revoke insert, update, delete on public.message_reports           from authenticated;
revoke insert, update, delete on public.dm_request_declines       from authenticated;
-- ...and anon gets nothing at all on them (20260726120000 lines 391-397).
-- Mirroring these is what keeps 98b's "anon has no read on any messaging
-- table" a real assertion now that the blanket grant above includes anon.
revoke all on public.conversations             from anon;
revoke all on public.conversation_participants from anon;
revoke all on public.conversation_state        from anon;
revoke all on public.messages                  from anon;
revoke all on public.message_reactions         from anon;
revoke all on public.message_reports           from anon;
revoke all on public.dm_request_declines       from anon;
-- moderation (20260727180000): the audit trail is append-only for EVERYONE,
-- including moderators — only the definer RPCs write it.
-- `profiles.is_moderator` needs no line here: the column grants above list
-- their columns explicitly, so a new column is excluded by omission. That is
-- the reason those grants enumerate columns instead of revoking the ones they
-- want to hide.
revoke all on public.moderation_actions from authenticated, anon;
-- anon write revoke (20260727190000), re-applied after the blanket grant above.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      t.tablename);
  end loop;
end $$;
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
      'reseed_group_rubrics',
      'touch_updated_at', 'prevent_unreveal', 'auto_hide_reported',
      'notify_session_created', 'notify_scores_locked',
      'notify_group_member_added', 'notify_comment_reply', 'push_notify',
      -- messaging internals (20260726120000): dm_request_declined would be a
      -- "were you declined?" probe; the rest are trigger-only.
      'dm_request_declined', 'touch_conversation_activity',
      'notify_new_message', 'auto_hide_reported_message',
      'create_group_conversation',
      -- rate-limit trigger internals (20260727120000)
      'rate_limit_message', 'rate_limit_comment', 'rate_limit_dm'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

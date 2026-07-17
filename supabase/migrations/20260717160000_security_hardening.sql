-- Security hardening pass (driven by the Supabase security advisors).
--
-- 1) Postgres grants EXECUTE to PUBLIC on every new function, which made
--    every SECURITY DEFINER function here callable by `anon` — and the
--    trigger-only internals (push_notify, notify_*, handle_*, ...)
--    callable by any signed-in user. Nobody should be able to forge a
--    push event or invoke a trigger body directly.
--    Sweep: strip PUBLIC + anon everywhere; trigger-only internals also
--    lose `authenticated`; real RPCs and RLS-policy helpers get an
--    explicit `authenticated` grant back (authenticated inherits from
--    PUBLIC, so a bare revoke would have broken every policy that calls
--    is_group_member / has_locked_scorecard / ...).
--    Triggers keep firing: EXECUTE is checked at CREATE TRIGGER time,
--    not at fire time, and definer bodies run as their owner.
--
-- 2) touch_updated_at / prevent_unreveal had a mutable search_path
--    (they only touch NEW/OLD, so pinning is free).
--
-- Advisor findings accepted as-is, for the record:
--   * titles_insert_authenticated WITH CHECK (true) — titles is a global
--     insert-only cache (no UPDATE policy exists; the client only inserts).
--   * banned_terms / notification_config have RLS on with no policies —
--     deny-all to clients is the point (service-managed tables).
--   * pg_net lives in the public schema — moving an extension the push
--     triggers depend on isn't worth the risk; revisit if Supabase ships
--     a migration path.

alter function public.touch_updated_at() set search_path = '';
alter function public.prevent_unreveal() set search_path = '';

do $$
declare
  f record;
  -- Trigger-only internals: never a client API. (Verified: no rpc() call
  -- in the app references any of these.)
  v_internal constant text[] := array[
    'handle_new_user', 'handle_new_group', 'seed_member_rubric',
    'touch_updated_at', 'prevent_unreveal', 'auto_hide_reported',
    'notify_session_created', 'notify_scores_locked',
    'notify_group_member_added', 'notify_comment_reply', 'push_notify'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosecdef or p.proname = any (v_internal))
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname = any (v_internal) then
      execute format('revoke all on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- From here on, NEW functions get no automatic PUBLIC execute: every
-- future migration must grant explicitly (RPCs and RLS helpers to
-- authenticated). The test suites fail loudly if a grant is forgotten.
alter default privileges in schema public revoke execute on functions from public;

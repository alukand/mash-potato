-- Take every write privilege on every public table away from `anon`.
--
-- Found on 2026-07-27 while shipping moderation: hosted granted `anon`
-- INSERT, UPDATE, DELETE and TRUNCATE on all 21 public tables, including
-- `profiles.banned` and the brand-new `profiles.is_moderator`.
--
-- Nothing was exploitable. Not one policy on any of those tables names
-- `anon`, so RLS denied every row, and both probes came back 401 (an
-- is_moderator PATCH and a profiles INSERT). This is the LATENT form of the
-- same finding the launch-hardening audit filed against `titles`: the grant
-- already said yes, and only an absence said no. Add one permissive policy
-- to any of those tables and it opens with no other warning.
--
-- Two reasons this needed a migration of its own rather than a line in the
-- moderation one:
--
--  1. It is a CLASS. Revoking `is_moderator` alone would have left twenty
--     other tables in the same shape and made the next one a fresh surprise.
--  2. Local and hosted DISAGREE about it. `20260727120000_launch_hardening`
--     revoked writes on `titles` from `authenticated` only, and
--     `hardening_test.sql` still asserted that anon cannot INSERT there —
--     and PASSED, because a local `db reset` never granted anon those
--     privileges in the first place. A green suite was describing a posture
--     that only existed on this machine.
--
-- SELECT is deliberately untouched. anon reads nothing today, but revoking
-- reads is a behavioural change; revoking writes it never had a use for is
-- not.

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

-- Future tables: the platform's default privileges are what handed these out,
-- so change the default rather than remembering to revoke each time.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;

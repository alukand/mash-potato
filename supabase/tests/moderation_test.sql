-- Moderation tooling: the role that cannot be self-granted, the queue that
-- only moderators can open, and the audit trail nobody can rewrite.
-- Run with:  npx supabase test db
--
-- The shape of the risk here is unusual for this app. Every other definer RPC
-- is scoped to the CALLER's own data; these read other people's private
-- messages by design. So the privilege boundary is the whole product: if
-- `is_moderator` can be self-granted, or the guard is missing from one RPC,
-- any signed-in account can read every reported DM in the database.

create extension if not exists pgtap with schema extensions;

begin;
select plan(32);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

-- Ana is the moderator, and the ONLY way to become one is this: a write from
-- outside the app. There is no RPC that grants it.
update public.profiles set is_moderator = true
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Ben posts a comment that three people report, so it auto-hides.
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('d0000000-0000-4000-8000-000000000001', 999001, 'movie', 'Test Film', 2020);

-- The rate-limit trigger reads auth.uid(), so seeding content needs a caller
-- even while the ROLE is still postgres.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.title_comments (id, title_id, author_id, body, auto_hidden)
values ('c0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a reported take', true);

insert into public.comment_reports (comment_id, reporter_id, reason) values
  ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'abusive'),
  ('c0000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'same');

-- ---- the role cannot be reached from a client -------------------------------

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_moderator', 'UPDATE'),
  'is_moderator: authenticated cannot write it — a self-grantable moderator flag is no boundary at all');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_moderator', 'SELECT'),
  'is_moderator: authenticated cannot read it — who moderates is not a fact that makes anyone safer');

select ok(
  not has_column_privilege('anon', 'public.profiles', 'is_moderator', 'UPDATE'),
  'is_moderator: anon cannot write it');

-- ---- the audit trail is append-only, and not by convention ------------------

select ok(
  not has_table_privilege('authenticated', 'public.moderation_actions', 'SELECT'),
  'moderation_actions: authenticated cannot read it directly');

select ok(
  not has_table_privilege('authenticated', 'public.moderation_actions', 'INSERT'),
  'moderation_actions: authenticated cannot forge a row');

select ok(
  not has_table_privilege('authenticated', 'public.moderation_actions', 'UPDATE'),
  'moderation_actions: nobody can rewrite what they did — this is the whole point of a trail');

select ok(
  not has_table_privilege('authenticated', 'public.moderation_actions', 'DELETE'),
  'moderation_actions: nobody can erase what they did');

select ok(
  not has_table_privilege('anon', 'public.moderation_actions', 'SELECT'),
  'moderation_actions: anon cannot read it');

-- ---- anon holds no execute on any of it -------------------------------------
--
-- GRANTS LAW: `revoke ... from public` alone passed both suites once and still
-- shipped two functions that answered 200 to the anon key on hosted.

select ok(not has_function_privilege('anon', 'public.moderation_queue()', 'EXECUTE'),
  'grants: anon cannot execute moderation_queue');
select ok(not has_function_privilege('anon', 'public.resolve_report(text, uuid, text, text)', 'EXECUTE'),
  'grants: anon cannot execute resolve_report');
select ok(not has_function_privilege('anon', 'public.set_user_banned(uuid, boolean, text)', 'EXECUTE'),
  'grants: anon cannot execute set_user_banned');
select ok(not has_function_privilege('anon', 'public.moderation_log(integer)', 'EXECUTE'),
  'grants: anon cannot execute moderation_log');
select ok(not has_function_privilege('anon', 'public.is_moderator()', 'EXECUTE'),
  'grants: anon cannot execute is_moderator');

-- ---- anon holds no write on ANY public table --------------------------------
--
-- Class-level on purpose. Hosted granted anon INSERT/UPDATE/DELETE/TRUNCATE on
-- all 21 tables while every per-table assertion passed locally, because a
-- local `db reset` never issued those grants. Asserting the CLASS is the only
-- version of this test that cannot quietly go stale as tables are added.

select is(
  (select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
     from information_schema.table_privileges
    where table_schema = 'public' and grantee = 'anon'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '',
  'anon holds no write privilege on any public table');

-- ---- a signed-in NON-moderator is refused by every entry point ---------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(public.is_moderator(), false, 'is_moderator: an ordinary member is not one');

select throws_ok(
  $$ select * from public.moderation_queue() $$,
  'not a moderator',
  'moderation_queue: refuses a non-moderator — it reads other people''s private messages');

select throws_ok(
  $$ select public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001', 'dismiss') $$,
  'not a moderator',
  'resolve_report: refuses a non-moderator');

select throws_ok(
  $$ select public.set_user_banned('cccccccc-cccc-cccc-cccc-cccccccccccc', true) $$,
  'not a moderator',
  'set_user_banned: refuses a non-moderator');

select throws_ok(
  $$ select * from public.moderation_log() $$,
  'not a moderator',
  'moderation_log: refuses a non-moderator');

-- The reported author cannot un-hide their own comment by dismissing it.
select is(
  (select auto_hidden from public.title_comments
    where id = 'c0000000-0000-4000-8000-000000000001'),
  true,
  'the author''s refused dismiss left the auto-hide in place');

-- ---- the moderator ----------------------------------------------------------

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(public.is_moderator(), true, 'is_moderator: Ana is one');

-- Two reporters, ONE row of work. A queue that lists reports rather than
-- content makes a pile-on look like a backlog.
-- Scoped to THIS fixture on purpose. `moderation_queue()` is global, so an
-- assertion over the whole result set only passes on an empty database and
-- fails the moment anyone has used the app.
select results_eq(
  $$ select kind, report_count, already_hidden from public.moderation_queue()
      where content_id = 'c0000000-0000-4000-8000-000000000001' $$,
  $$ values ('comment'::text, 2, true) $$,
  'moderation_queue: collapses every report on one piece of content into a single row');

select lives_ok(
  $$ select public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001',
                                  'dismiss', 'reported for disagreeing') $$,
  'resolve_report: a moderator can dismiss');

-- Three bad-faith reports auto-hide a comment. If dismissing left it hidden,
-- brigading would be a permanent mute that no moderator could undo.
select is(
  (select auto_hidden from public.title_comments
    where id = 'c0000000-0000-4000-8000-000000000001'),
  false,
  'resolve_report: dismiss UN-hides an auto-hidden comment');

select is(
  (select count(*)::int from public.comment_reports
    where comment_id = 'c0000000-0000-4000-8000-000000000001' and resolved_at is null),
  0,
  'resolve_report: closes EVERY report row for that content, not just one');

select is(
  (select count(*)::int from public.moderation_queue()
    where content_id = 'c0000000-0000-4000-8000-000000000001'),
  0,
  'moderation_queue: resolved work leaves the queue');

-- `moderation_log(1)` rather than the whole trail, for the same reason: the
-- newest entry is deterministic (clock_timestamp), the whole log is not.
select results_eq(
  $$ select action, target_kind, moderator_name, target_name, note
       from public.moderation_log(1) $$,
  $$ values ('dismiss'::text, 'comment'::text, 'Ana'::text, 'Ben'::text,
             'reported for disagreeing'::text) $$,
  'moderation_log: the action carries who did it, to whom, and why');

-- ---- guards on the action itself --------------------------------------------

select throws_ok(
  $$ select public.set_user_banned('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true) $$,
  'you cannot moderate yourself',
  'set_user_banned: a moderator cannot moderate themselves');

select throws_ok(
  $$ select public.resolve_report('profile', 'c0000000-0000-4000-8000-000000000001', 'dismiss') $$,
  'that is not something you can moderate',
  'resolve_report: the kind is checked, so the id cannot be pointed at another table');

select throws_ok(
  $$ select public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001', 'delete') $$,
  'that is not an action',
  'resolve_report: the action is checked');

-- Unbanning is a first-class action with its own record: a lifted ban that
-- leaves no trace looks identical to a ban that never happened.
select lives_ok(
  $$ select public.set_user_banned('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, 'appealed') $$,
  'set_user_banned: a moderator can lift a ban');

select is(
  (select action from public.moderation_log(1)),
  'unban',
  'moderation_log: lifting a ban is recorded too');

reset role;
select * from finish();
rollback;

-- Launch hardening: the three surfaces that were open, and the ceiling that
-- was missing. Run with:  npx supabase test db
--
-- Every assertion here is a hole that WAS open on the hosted project on
-- 2026-07-27, so each one is a regression test, not a hypothetical.

create extension if not exists pgtap with schema extensions;

begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

-- ---- titles: no direct writes at all --------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.titles', 'INSERT'),
  'titles: authenticated cannot INSERT (was `with check (true)`)');

select ok(
  not has_table_privilege('authenticated', 'public.titles', 'UPDATE'),
  'titles: authenticated cannot UPDATE (the grant was live, only a missing policy stopped it)');

select ok(
  not has_table_privilege('anon', 'public.titles', 'INSERT'),
  'titles: anon cannot INSERT');

select ok(
  has_table_privilege('authenticated', 'public.titles', 'SELECT'),
  'titles: reading stays open — every group needs rows other groups created');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'titles' and cmd = 'INSERT'),
  0,
  'titles: the open INSERT policy is gone');

-- ---- profiles: moderation state is not public ------------------------------

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'banned', 'SELECT'),
  'profiles: authenticated cannot read `banned` (an oracle for who was sanctioned)');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'SELECT'),
  'profiles: authenticated cannot read `created_at`');

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT'),
  'profiles: display_name stays readable — five PostgREST embeds depend on it');

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'avatar_key', 'SELECT'),
  'profiles: avatar_key stays readable');

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'profiles: the TABLE-level select grant is gone (a column revoke alone does nothing while it stands)');

-- ---- rate_limits: definer-only ---------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.rate_limits', 'SELECT'),
  'rate_limits: authenticated cannot read it (it would measure other people)');

select ok(
  not has_table_privilege('anon', 'public.rate_limits', 'SELECT'),
  'rate_limits: anon cannot read it');

-- ---- the limiter actually limits -------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$ select public.consume_rate_limit('t_probe', 2, 60) $$,
  'consume_rate_limit: first call inside the window is allowed');
select lives_ok(
  $$ select public.consume_rate_limit('t_probe', 2, 60) $$,
  'consume_rate_limit: second call is allowed');
select throws_ok(
  $$ select public.consume_rate_limit('t_probe', 2, 60) $$,
  'you are doing that too fast, give it a moment',
  'consume_rate_limit: the call past the limit is refused');
select lives_ok(
  $$ select public.consume_rate_limit('t_other', 2, 60) $$,
  'consume_rate_limit: a different bucket is unaffected');

-- ---- ensure_title validates what it is handed ------------------------------

select throws_ok(
  $$ select public.ensure_title(null, 'movie', 'Sneaky', 2020, 'https://evil.example/x.jpg') $$,
  'that poster path is not usable',
  'ensure_title: a poster path must be a path, not a URL (it is interpolated into an img src)');

select throws_ok(
  $$ select public.ensure_title(null, 'movie', E'Line one\nLine two', 2020, null) $$,
  'that title name is not usable',
  'ensure_title: control characters cannot break out of the line a name renders on');

select throws_ok(
  $$ select public.ensure_title(null, 'book', 'Not A Film', 2020, null) $$,
  'a title is a film or a show',
  'ensure_title: media type is film or show');

-- Same TMDB id twice returns the SAME row rather than a duplicate or a 23505
-- the client has to catch.
select is(
  public.ensure_title(603, 'movie', 'The Matrix', 1999, null),
  public.ensure_title(603, 'movie', 'The Matrix (dupe attempt)', 1999, null),
  'ensure_title: is idempotent on (tmdb_id, media_type)');

reset role;
select * from finish();
rollback;

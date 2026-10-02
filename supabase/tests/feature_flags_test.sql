-- Feature flags: everyone may read, no client may write, and the one flag
-- that exists ships OFF. Run with:  npx supabase test db
--
-- The client fails closed on its own (src/lib/featureFlags.ts); these tests
-- prove the server half — that no client can flip a flag, whatever it sends.

create extension if not exists pgtap with schema extensions;

begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now());

-- ---- the table -------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.feature_flags'::regclass),
  'feature_flags: row level security is on');

select is(
  (select enabled from public.feature_flags where key = 'livestreaming'),
  false,
  'livestreaming ships OFF');

-- ---- grants: read for everyone, write for no client ------------------------

select ok(
  has_table_privilege('anon', 'public.feature_flags', 'SELECT'),
  'anon can read flags (signed-out visitors are gated too)');

select ok(
  has_table_privilege('authenticated', 'public.feature_flags', 'SELECT'),
  'authenticated can read flags');

select ok(
  not has_table_privilege('anon', 'public.feature_flags', 'INSERT')
  and not has_table_privilege('anon', 'public.feature_flags', 'UPDATE')
  and not has_table_privilege('anon', 'public.feature_flags', 'DELETE')
  and not has_table_privilege('anon', 'public.feature_flags', 'TRUNCATE'),
  'anon cannot write flags');

select ok(
  not has_table_privilege('authenticated', 'public.feature_flags', 'INSERT')
  and not has_table_privilege('authenticated', 'public.feature_flags', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.feature_flags', 'DELETE')
  and not has_table_privilege('authenticated', 'public.feature_flags', 'TRUNCATE'),
  'authenticated cannot write flags');

select ok(
  has_table_privilege('service_role', 'public.feature_flags', 'SELECT')
  and not has_table_privilege('service_role', 'public.feature_flags', 'UPDATE')
  and not has_table_privilege('service_role', 'public.feature_flags', 'INSERT'),
  'service_role reads flags (the live Edge Function) but cannot flip them');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'feature_flags' and cmd <> 'SELECT'),
  0,
  'no write policy exists, so even a stray grant would not open writes');

-- ---- as anon ----------------------------------------------------------------

set local role anon;

select is(
  (select enabled from public.feature_flags where key = 'livestreaming'),
  false,
  'anon reads the livestreaming row');

select throws_ok(
  $$update public.feature_flags set enabled = true where key = 'livestreaming'$$,
  '42501', null,
  'anon cannot turn a flag on');

select throws_ok(
  $$insert into public.feature_flags (key, enabled) values ('anon_flag', true)$$,
  '42501', null,
  'anon cannot add a flag');

select throws_ok(
  $$delete from public.feature_flags where key = 'livestreaming'$$,
  '42501', null,
  'anon cannot delete a flag (a missing row reads as off, but still)');

reset role;

-- ---- as a signed-in user ----------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select enabled from public.feature_flags where key = 'livestreaming'),
  false,
  'a signed-in user reads the livestreaming row');

select throws_ok(
  $$update public.feature_flags set enabled = true where key = 'livestreaming'$$,
  '42501', null,
  'a signed-in user cannot turn a flag on');

select throws_ok(
  $$insert into public.feature_flags (key, enabled) values ('my_flag', true)$$,
  '42501', null,
  'a signed-in user cannot add a flag');

select throws_ok(
  $$delete from public.feature_flags where key = 'livestreaming'$$,
  '42501', null,
  'a signed-in user cannot delete a flag');

reset role;

select is(
  (select enabled from public.feature_flags where key = 'livestreaming'),
  false,
  'after every attempt, livestreaming is still off');

-- ---- the operator path (SQL Editor) ------------------------------------------

update public.feature_flags
   set enabled = true, updated_at = '2000-01-01'
 where key = 'livestreaming';

select ok(
  (select enabled and updated_at > '2000-01-02' from public.feature_flags where key = 'livestreaming'),
  'the documented flip works, and updated_at is stamped by the trigger, not the caller');

select throws_ok(
  $$insert into public.feature_flags (key) values ('Not A Key')$$,
  '23514', null,
  'flag keys are lower_snake_case, so a typo cannot create a look-alike');

select * from finish();
rollback;

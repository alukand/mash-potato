-- Follows and the feed of shared ratings. Run with: npx supabase test db
--
-- Cast: Ana follows people. Ben shares his ratings (once he opts in); Cat
-- never shares; Dan has blocked Ana; Eve shares but Ana blocks her later;
-- Fay is banned. Ben also has a BLIND group card, which must never surface.

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'ana@test.dev', 'Ana'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'ben@test.dev', 'Ben'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'cat@test.dev', 'Cat'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'dan@test.dev', 'Dan'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'eve@test.dev', 'Eve'),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'fay@test.dev', 'Fay')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now();

insert into public.titles (id, tmdb_id, media_type, name, year) values
  ('f5000000-0000-4000-8000-000000000001', 770001, 'movie', 'Shared Film', 2024),
  ('f5000000-0000-4000-8000-000000000002', 770002, 'movie', 'Blind Film', 2024),
  ('f5000000-0000-4000-8000-000000000003', 770003, 'movie', 'Cat Film', 2024);

-- solo ratings (the only thing a feed may carry)
insert into public.global_ratings (user_id, title_id, scores) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f5000000-0000-4000-8000-000000000001', '{"enjoyment": 9}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'f5000000-0000-4000-8000-000000000003', '{"enjoyment": 4}'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'f5000000-0000-4000-8000-000000000003', '{"enjoyment": 7}'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'f5000000-0000-4000-8000-000000000003', '{"enjoyment": 2}');
update public.profiles set share_ratings = true
 where id in ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
update public.profiles set banned = true where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- Ben's blind card in a group round: never feed material
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('f5000000-0000-4000-8000-0000000000a1', 'Ben Crew', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('f5000000-0000-4000-8000-0000000000b1', 'f5000000-0000-4000-8000-0000000000a1',
        'f5000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.member_scores (session_id, member_id, scores, locked)
values ('f5000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"enjoyment": 3}', true);

insert into public.user_blocks (blocker_id, blocked_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ---- following ----------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok($$select public.follow_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'you cannot follow yourself', 'no following yourself');
select lives_ok($$select public.follow_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$, 'Ana follows Ben');
select lives_ok($$select public.follow_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$, 'again, harmlessly');
select is((select count(*)::int from public.follows where follower_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'one follow, however many taps');
select throws_ok($$select public.follow_user('dddddddd-dddd-dddd-dddd-dddddddddddd')$$,
  'P0001', 'you cannot follow this person', 'someone who blocked you cannot be followed');
select throws_ok($$select public.follow_user('ffffffff-ffff-ffff-ffff-ffffffffffff')$$,
  'P0001', 'you cannot follow this person', 'a banned account cannot be followed');
update public.profiles set banned = false where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select lives_ok($$select public.follow_user('ffffffff-ffff-ffff-ffff-ffffffffffff')$$, 'Ana follows Fay before her ban');
update public.profiles set banned = true where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select lives_ok($$select public.follow_user('cccccccc-cccc-cccc-cccc-cccccccccccc')$$, 'Ana follows Cat');
select lives_ok($$select public.follow_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')$$, 'Ana follows Eve');

-- ---- nothing is shared until someone opts in ------------------------------------------
select is(
  (select row(following, shares_ratings)::text from public.follow_state('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  row(true, false)::text, 'Ana follows Ben, who shares nothing yet');
select is(
  (select count(*)::int from public.following_feed(30) where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0, 'following alone shows nothing of Ben');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok($$select public.set_share_ratings(null)$$,
  'P0001', 'choose whether to share your ratings', 'sharing is a yes or a no');
select lives_ok($$select public.set_share_ratings(true)$$, 'Ben turns sharing on');
select is((select row(followers, following, share_ratings)::text from public.my_follow_summary()),
  row(1::bigint, 0::bigint, true)::text, 'Ben sees his own counts and his setting');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(
  (select array_agg(title_name order by title_name) from public.following_feed(30)),
  array['Cat Film', 'Shared Film'],
  'the feed: Ben''s rating and Eve''s, never Cat''s (no sharing) or Fay''s (banned)');
select ok(
  not exists (select 1 from public.following_feed(30) where title_name = 'Blind Film'),
  'a blind group card never reaches the feed');
select is(
  (select scores from public.following_feed(30) where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '{"enjoyment": 9}'::jsonb, 'the feed carries the scores the app computes the number from');
select is(
  (select count(*)::int from public.following_feed(30, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  1, 'one person''s feed, for their page');

-- ---- blocks cut it off; unfollowing ends it -------------------------------------------
insert into public.user_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select ok(
  not exists (select 1 from public.following_feed(30) where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'blocking someone removes them from your feed');
select is(
  (select array_agg(display_name order by display_name) from public.my_following()),
  array['Ben', 'Cat', 'Eve'], 'Ana''s own follow list (the banned account is gone from it)');
select lives_ok($$select public.unfollow_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$, 'Ana unfollows Ben');
select is((select count(*)::int from public.following_feed(30)), 0, 'and his ratings leave her feed');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is((select count(*)::int from public.following_feed(30, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  0, 'someone who does not follow Ben cannot read his ratings, even by asking for him');

-- ---- who may touch what ---------------------------------------------------------------
select ok(
  not exists (select 1 from unnest(array['anon', 'authenticated']) r
               cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
               where has_table_privilege(r, 'public.follows', p)),
  'no client role touches the follows table');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'share_ratings', 'SELECT')
  and not has_column_privilege('anon', 'public.profiles', 'share_ratings', 'SELECT'),
  'nobody reads share_ratings off the profiles table');
select ok(
  not has_function_privilege('anon', 'public.following_feed(integer, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.follow_user(uuid)', 'execute'),
  'anon cannot follow or read a feed');

select finish();
rollback;

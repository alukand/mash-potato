-- Join requests: groups that review who joins, with an optional question.
-- Run with: npx supabase test db
--
-- Cast: Ola owns "Late Night Club". Ana asks and is approved; Ben is
-- declined and tries again too soon; Cat is blocked by Ola; Dan asks,
-- withdraws, asks again, then joins when the group opens; Eve never accepted
-- the community terms.

create extension if not exists pgtap with schema extensions;

begin;
select plan(39);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'ola@test.dev', 'Ola'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'ana@test.dev', 'Ana'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'ben@test.dev', 'Ben'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'cat@test.dev', 'Cat'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'dan@test.dev', 'Dan'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'eve@test.dev', 'Eve')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now()
 where id <> 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

insert into public.banned_terms (term) values ('zxqslur') on conflict do nothing;

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('f3000000-0000-4000-8000-000000000001', 'Late Night Club', '11111111-1111-1111-1111-111111111111');
insert into public.group_discovery (group_id, searchable)
values ('f3000000-0000-4000-8000-000000000001', true);

-- ---- the owner sets the door ----------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'approval', null)$$,
  'P0001', 'only the group owner can change who joins', 'only the owner sets the join policy');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'approval', 'Say zxqslur')$$,
  'P0001', 'that question contains language that is not allowed here', 'the question passes the wordlist');
select throws_ok(
  $$select public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'closed', null)$$,
  'P0001', 'choose whether anyone can join or you approve each request', 'only open or approval');
select lives_ok(
  $$select public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'approval',
      '  What film made you cry last?  ')$$,
  'the owner asks for approval with a question');
select is(
  (select row(searchable, join_policy, join_question, pending_count)::text
     from public.group_join_settings('f3000000-0000-4000-8000-000000000001')),
  row(true, 'approval', 'What film made you cry last?', 0::bigint)::text,
  'the owner reads the settings back, question trimmed');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select * from public.group_join_settings('f3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'only the group owner can view who joins', 'nobody else reads the settings');

-- ---- Ana browses, asks, and gets in ---------------------------------------------
select is(
  (select row(join_policy, join_question, my_status)::text
     from public.browse_open_groups('Late Night', false)),
  row('approval', 'What film made you cry last?', null::text)::text,
  'the catalogue shows the policy and the question');
select throws_ok(
  $$select public.join_open_group('f3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'this group reviews requests to join', 'join_open_group is no way around approval');
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', '   ')$$,
  'P0001', 'answer the group''s question to ask', 'a question needs an answer');
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'zxqslur obviously')$$,
  'P0001', 'that answer contains language that is not allowed here', 'answers pass the wordlist');
select is(
  public.request_to_join('f3000000-0000-4000-8000-000000000001', E'Coco.\nEvery time.'),
  'pending', 'Ana asks, with a two-line answer');
select is(
  (select my_status from public.browse_open_groups('Late Night', false)),
  'pending', 'the catalogue shows her request waiting');
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Again')$$,
  'P0001', 'you already asked; the owner will decide', 'one request at a time');
select throws_ok(
  $$select * from public.pending_join_requests('f3000000-0000-4000-8000-000000000001')$$,
  'P0001', 'only the group owner can see requests', 'an applicant cannot read the queue');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select row(display_name, question, answer)::text
     from public.pending_join_requests('f3000000-0000-4000-8000-000000000001')),
  row('Ana', 'What film made you cry last?', E'Coco.\nEvery time.')::text,
  'the owner sees who asked, the question as asked, and the answer');
select is(
  (select pending_count from public.group_join_settings('f3000000-0000-4000-8000-000000000001')),
  1::bigint, 'the settings count the waiting request');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  format('select public.decide_join_request(%L, true)',
    (select id from public.group_join_requests where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  'P0001', 'only the group owner can decide requests', 'an applicant cannot approve herself');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  format('select public.decide_join_request(%L, true)',
    (select id from public.group_join_requests where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  'the owner approves Ana');
select ok(
  exists (select 1 from public.group_members
           where group_id = 'f3000000-0000-4000-8000-000000000001'
             and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and role = 'member'),
  'approval makes her a member');
select is(
  (select status from public.group_join_requests where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'approved', 'and records the decision');
select throws_ok(
  format('select public.decide_join_request(%L, false)',
    (select id from public.group_join_requests where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  'P0001', 'that request was already decided', 'a decision is final');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(
  (select my_status from public.browse_open_groups('Late Night', false)),
  'member', 'the catalogue now shows her in');

-- ---- Ben is declined and must wait a week ---------------------------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Up'), 'pending', 'Ben asks');
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  format('select public.decide_join_request(%L, false)',
    (select id from public.group_join_requests where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  'the owner declines Ben');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select ok(
  not exists (select 1 from public.group_members
               where group_id = 'f3000000-0000-4000-8000-000000000001'
                 and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'a declined request adds no one');
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Please')$$,
  'P0001', 'you can ask this group again a week after your last request', 'a decline holds for a week');

-- ---- Cat is blocked; Eve skipped the terms --------------------------------------
insert into public.user_blocks (blocker_id, blocked_id)
values ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Hi')$$,
  'P0001', 'this group is not open to join', 'someone the owner blocked cannot ask, and is not told why');
set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Hi')$$,
  'P0001', 'accept the community terms first', 'asking needs the community terms');

-- ---- Dan withdraws, asks again, then the group opens ----------------------------
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select is(public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Heat'), 'pending', 'Dan asks');
select lives_ok($$select public.withdraw_join_request('f3000000-0000-4000-8000-000000000001')$$,
  'and withdraws');
select is(public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Heat, again'), 'pending',
  'a withdrawn request does not hold him back');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'open', 'Ignored?')$$,
  'the owner opens the group');
select is(
  (select join_question from public.group_discovery where group_id = 'f3000000-0000-4000-8000-000000000001'),
  null, 'an open group keeps no question');

set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select throws_ok(
  $$select public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Heat')$$,
  'P0001', 'this group is open: join it directly', 'an open group takes no requests');
select lives_ok($$select public.join_open_group('f3000000-0000-4000-8000-000000000001')$$,
  'Dan joins the open group directly');
select is(
  (select status from public.group_join_requests
    where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' order by created_at desc limit 1),
  'withdrawn', 'joining retires the request he left waiting');

-- ---- who may touch what ---------------------------------------------------------
select ok(
  not exists (select 1 from unnest(array['anon', 'authenticated']) r
               cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
               where has_table_privilege(r, 'public.group_join_requests', p)),
  'no client role touches the requests table');
select ok(
  not has_function_privilege('anon', 'public.request_to_join(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.decide_join_request(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.pending_join_requests(uuid)', 'execute'),
  'anon cannot ask, decide, or read requests');
select ok(
  has_function_privilege('anon', 'public.browse_open_groups(text, boolean)', 'execute'),
  'browsing stays open to signed-out visitors');

select finish();
rollback;

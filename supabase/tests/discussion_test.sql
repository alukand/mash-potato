-- Discussion: threads, reactions, cred, and the compliance kit, proven
-- against live RLS. THE ONE RULE extends to words: group threads are sealed
-- per member while their card is open. Run with: npx supabase test db.
--
-- Cast: Ana (owner), Ben (member), Cara (outsider), Dan (outsider).

create extension if not exists pgtap with schema extensions;

begin;
select plan(30);

-- ---- seed as the test superuser ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dan@test.dev', '{"display_name":"Dan"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ---- Ana: group + membership ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- 1: the terms gate comes first
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'first!')$$,
  'P0001', 'accept the community terms first',
  'terms: posting before accepting the terms is rejected');

-- everyone accepts terms
select lives_ok($$select public.accept_discussion_terms()$$, 'terms: accepting works');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select public.accept_discussion_terms();
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select public.accept_discussion_terms();
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select public.accept_discussion_terms();

-- ---- group thread: open before any round ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'Should we watch this one?')$$,
  'group thread: open for pre-round chatter (no session yet)');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where group_id = '99999999-9999-9999-9999-999999999999'),
  1, 'group thread: a member reads it');

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where group_id = '99999999-9999-9999-9999-999999999999'),
  0, 'group thread: an outsider sees nothing');
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'let me in')$$,
  'P0001', 'not a member of this group',
  'group thread: an outsider cannot post');

-- ---- THE SEAL: a round starts, the thread closes per member ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '[{"key":"story","label":"Story","weight":20}]');
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story":8}', true);

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where group_id = '99999999-9999-9999-9999-999999999999'),
  0, 'SEALED: a live round hides the thread from a member with an open card');
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'it was mid')$$,
  'P0001', 'this thread is sealed until you lock your scorecard',
  'SEALED: an open card cannot post either');

-- Ben locks; Ana reveals; the thread opens again for Ben
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story":9}', true);
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.reveal_session('66666666-6666-6666-6666-666666666666');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where group_id = '99999999-9999-9999-9999-999999999999'),
  1, 'UNSEALED: locking + the reveal reopen the thread');

-- ---- public takes: gated on having rated ----
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'drive-by opinion')$$,
  'P0001', 'rate this title first to join the discussion',
  'public: posting without having rated is rejected');

insert into public.global_ratings (user_id, title_id, scores)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        '77777777-7777-7777-7777-777777777777', '{"story":7}');
select lives_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'Rated it, loved the sandworms')$$,
  'public: a rated user posts a take');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments where group_id is null),
  1, 'public: takes are readable by everyone signed in');

-- Ben (rated via his locked card in the revealed round) replies
select lives_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null,
      (select id from public.title_comments where group_id is null and parent_id is null limit 1),
      'Sandworms carried it')$$,
  'public: a locked card in a revealed round counts as rated');
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null,
      (select id from public.title_comments where parent_id is not null limit 1),
      'reply to a reply')$$,
  'P0001', 'replies go one level deep',
  'threading: replies are one level deep');

-- ---- reactions + cred ----
select lives_ok(
  $$insert into public.comment_reactions (comment_id, user_id, kind)
    values (
      (select id from public.title_comments
         where group_id = '99999999-9999-9999-9999-999999999999' limit 1),
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'like')$$,
  'reactions: a member reacts to a group comment');
select is(
  (select cred from public.group_cred('99999999-9999-9999-9999-999999999999')
     where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint, 'cred: a reaction received counts for the author');

-- switching the reaction keeps one row, one cred
update public.comment_reactions set kind = 'fire'
  where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select is(
  (select cred from public.group_cred('99999999-9999-9999-9999-999999999999')
     where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint, 'cred: switching a reaction does not double-count');

select throws_ok(
  $$insert into public.comment_reactions (comment_id, user_id, kind)
    values (
      (select id from public.title_comments where group_id is null and parent_id is null limit 1),
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'like')$$,
  '42501', null,
  'reactions: nobody reacts on someone else''s behalf');

-- outsiders cannot see group cred
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::int from public.group_cred('99999999-9999-9999-9999-999999999999')),
  0, 'cred: outsiders get nothing from group_cred');

-- ---- Dan rates + posts, then blocks Ben: hidden BOTH ways ----
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        '77777777-7777-7777-7777-777777777777', '{"story":5}');
select public.post_comment('77777777-7777-7777-7777-777777777777',
  null, null, 'Dan take: too much sand');
insert into public.user_blocks (blocker_id, blocked_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select count(*)::int from public.title_comments
     where author_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0, 'blocks: the blocker no longer sees the blocked user''s comments');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where author_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  0, 'blocks: it hides in the other direction too');

-- ---- reports: three distinct reporters auto-hide ----
-- Ana, Ben, Dan report Cara's public take.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.comment_reports (comment_id, reporter_id, reason)
select id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'spam'
  from public.title_comments
  where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.comment_reports (comment_id, reporter_id, reason)
select id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'spam'
  from public.title_comments
  where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
select is(
  (select count(*)::int from public.title_comments
     where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null),
  1, 'reports: two reports do not hide a comment');
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
insert into public.comment_reports (comment_id, reporter_id, reason)
select id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'spam'
  from public.title_comments
  where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null),
  0, 'reports: the third distinct reporter hides it for others');
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is(
  (select count(*)::int from public.title_comments
     where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null),
  1, 'reports: the author still sees their own hidden comment');

-- ---- the wordlist and the ban switch ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'kys loser')$$,
  'P0001', 'that comment contains language that is not allowed here',
  'filter: the wordlist rejects at post time');

reset role;
update public.profiles set banned = true
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'back again')$$,
  'P0001', 'posting is disabled for this account',
  'ban: a banned account cannot post');

-- the ban switch is not self-serviceable (column-level privilege)
select throws_ok(
  $$update public.profiles set banned = false
      where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '42501', null,
  'ban: the switch cannot be flipped by its owner');

-- ---- author soft-delete ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.delete_comment(
      (select id from public.title_comments
         where author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1))$$,
  'P0001', 'not your comment',
  'delete: only the author deletes their comment');
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.delete_comment(
      (select id from public.title_comments
         where author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1))$$,
  'delete: the author soft-deletes');
select is(
  (select body from public.title_comments
     where author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and deleted),
  '', 'delete: the words are gone, the placeholder row stays');

select * from finish();
rollback;

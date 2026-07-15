-- Discussion RLS twin: threads, seals, reactions, and the compliance kit on
-- vanilla Postgres. Plain-SQL port of supabase/tests/discussion_test.sql.
-- Cast: Ana (owner), Ben (member), Cara (outsider), Dan (outsider).

\set ON_ERROR_STOP on

begin;

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

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- PASS 1: the terms gate comes first
do $$
begin
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'first!');
    raise exception 'FAIL 1: posting worked before accepting the terms';
  exception when raise_exception then
    if sqlerrm = 'accept the community terms first' then
      raise notice 'PASS 1: posting before accepting the terms is rejected';
    else raise; end if;
  end;
end $$;

select public.accept_discussion_terms();
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select public.accept_discussion_terms();
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select public.accept_discussion_terms();
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select public.accept_discussion_terms();

-- PASS 2: group thread open pre-round; members read, outsiders get nothing
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.post_comment('77777777-7777-7777-7777-777777777777',
  '99999999-9999-9999-9999-999999999999', null, 'Should we watch this one?');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where group_id = '99999999-9999-9999-9999-999999999999';
  if c <> 1 then raise exception 'FAIL 2: member sees % group comments (want 1)', c; end if;
  raise notice 'PASS 2: a member reads the group thread';
end $$;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where group_id = '99999999-9999-9999-9999-999999999999';
  if c <> 0 then raise exception 'FAIL 3: outsider sees % group comments', c; end if;
  raise notice 'PASS 3: an outsider sees nothing in a group thread';
end $$;

-- PASS 4: the SEAL — a live round hides the thread from open cards
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
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where group_id = '99999999-9999-9999-9999-999999999999';
  if c <> 0 then raise exception 'FAIL 4: sealed thread visible to an open card (rows=%)', c; end if;
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      '99999999-9999-9999-9999-999999999999', null, 'it was mid');
    raise exception 'FAIL 4b: an open card posted into a sealed thread';
  exception when raise_exception then
    if sqlerrm <> 'this thread is sealed until you lock your scorecard' then raise; end if;
  end;
  raise notice 'PASS 4: a live round seals the thread (read AND write) per member';
end $$;

-- PASS 5: lock + reveal reopen it
insert into public.member_scores (session_id, member_id, scores, locked)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story":9}', true);
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.reveal_session('66666666-6666-6666-6666-666666666666');
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where group_id = '99999999-9999-9999-9999-999999999999';
  if c <> 1 then raise exception 'FAIL 5: thread still sealed after lock + reveal (rows=%)', c; end if;
  raise notice 'PASS 5: locking and the reveal reopen the thread';
end $$;

-- PASS 6: public takes gated on having rated
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
begin
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'drive-by opinion');
    raise exception 'FAIL 6: an unrated user posted a public take';
  exception when raise_exception then
    if sqlerrm = 'rate this title first to join the discussion' then
      raise notice 'PASS 6: public posting is gated on having rated';
    else raise; end if;
  end;
end $$;
insert into public.global_ratings (user_id, title_id, scores)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        '77777777-7777-7777-7777-777777777777', '{"story":7}');
select public.post_comment('77777777-7777-7777-7777-777777777777',
  null, null, 'Rated it, loved the sandworms');

-- PASS 7: replies are one level deep
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare v_take uuid; v_reply uuid;
begin
  select id into v_take from public.title_comments
    where group_id is null and parent_id is null limit 1;
  v_reply := public.post_comment('77777777-7777-7777-7777-777777777777',
    null, v_take, 'Sandworms carried it');
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      null, v_reply, 'reply to a reply');
    raise exception 'FAIL 7: a reply-to-a-reply was accepted';
  exception when raise_exception then
    if sqlerrm = 'replies go one level deep' then
      raise notice 'PASS 7: replies are one level deep';
    else raise; end if;
  end;
end $$;

-- PASS 8: reactions + cred (received-only, switch does not double-count)
do $$
declare v_cred bigint;
begin
  insert into public.comment_reactions (comment_id, user_id, kind)
  values ((select id from public.title_comments
             where group_id = '99999999-9999-9999-9999-999999999999' limit 1),
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'like');
  select cred into v_cred from public.group_cred('99999999-9999-9999-9999-999999999999')
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_cred is distinct from 1::bigint then
    raise exception 'FAIL 8: cred after one reaction is % (want 1)', v_cred;
  end if;
  update public.comment_reactions set kind = 'fire'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select cred into v_cred from public.group_cred('99999999-9999-9999-9999-999999999999')
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_cred is distinct from 1::bigint then
    raise exception 'FAIL 8b: cred after switching is % (want 1)', v_cred;
  end if;
  raise notice 'PASS 8: cred counts reactions received; switching never double-counts';
end $$;

-- PASS 9: nobody reacts on someone else's behalf
do $$
begin
  begin
    insert into public.comment_reactions (comment_id, user_id, kind)
    values ((select id from public.title_comments where group_id is null and parent_id is null limit 1),
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'like');
    raise exception 'FAIL 9: a reaction landed under another user''s name';
  exception when insufficient_privilege then
    raise notice 'PASS 9: reactions are self-only';
  end;
end $$;

-- PASS 10: blocks hide BOTH ways
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        '77777777-7777-7777-7777-777777777777', '{"story":5}');
select public.post_comment('77777777-7777-7777-7777-777777777777',
  null, null, 'Dan take: too much sand');
insert into public.user_blocks (blocker_id, blocked_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where author_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if c <> 0 then raise exception 'FAIL 10: blocker still sees the blocked (rows=%)', c; end if;
  raise notice 'PASS 10: the blocker no longer sees the blocked user';
end $$;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where author_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if c <> 0 then raise exception 'FAIL 10b: the blocked still sees the blocker (rows=%)', c; end if;
  raise notice 'PASS 10b: it hides in the other direction too';
end $$;

-- PASS 11: three distinct reporters auto-hide (author still sees it)
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
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
insert into public.comment_reports (comment_id, reporter_id, reason)
select id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'spam'
  from public.title_comments
  where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
  if c <> 0 then raise exception 'FAIL 11: three reports did not hide it (rows=%)', c; end if;
  raise notice 'PASS 11: three distinct reporters hide a comment';
end $$;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.title_comments
    where author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and parent_id is null;
  if c <> 1 then raise exception 'FAIL 11b: the author lost sight of their own comment'; end if;
  raise notice 'PASS 11b: the author still sees their hidden comment';
end $$;

-- PASS 12: the wordlist rejects at post time
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
begin
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'kys loser');
    raise exception 'FAIL 12: the wordlist did not fire';
  exception when raise_exception then
    if sqlerrm = 'that comment contains language that is not allowed here' then
      raise notice 'PASS 12: the wordlist rejects at post time';
    else raise; end if;
  end;
end $$;

-- PASS 13: the ban switch works and is not self-serviceable
reset role;
update public.profiles set banned = true
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
begin
  begin
    perform public.post_comment('77777777-7777-7777-7777-777777777777',
      null, null, 'back again');
    raise exception 'FAIL 13: a banned account posted';
  exception when raise_exception then
    if sqlerrm <> 'posting is disabled for this account' then raise; end if;
  end;
  begin
    update public.profiles set banned = false
      where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    raise exception 'FAIL 13b: the ban switch was self-flipped';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS 13: banned accounts cannot post and cannot unban themselves';
end $$;

-- PASS 14: author soft-delete only
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
begin
  begin
    perform public.delete_comment(
      (select id from public.title_comments
         where author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1));
    raise exception 'FAIL 14: someone else''s comment was deleted';
  exception when raise_exception then
    if sqlerrm = 'not your comment' then
      raise notice 'PASS 14: only the author deletes their comment';
    else raise; end if;
  end;
end $$;

do $$ begin raise notice '=== ALL 14 DISCUSSION ASSERTIONS PASSED — threads seal with the blind rule ==='; end $$;

rollback;

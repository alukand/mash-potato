-- Moderation tooling on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/moderation_test.sql.
--
-- These RPCs read other people's private messages by design, which makes them
-- the only definer functions in the app whose guard IS the feature. The twin
-- exists because the two stacks disagree about default privileges, and this is
-- the surface where that disagreement would cost the most.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

update public.profiles set is_moderator = true
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('d0000000-0000-4000-8000-000000000001', 999001, 'movie', 'Test Film', 2020);

-- the rate-limit trigger reads auth.uid() even while the role is postgres
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.title_comments (id, title_id, author_id, body, auto_hidden)
values ('c0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a reported take', true);

insert into public.comment_reports (comment_id, reporter_id, reason) values
  ('c0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'abusive'),
  ('c0000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'same');

-- PASS 1: the moderator flag cannot be reached from a client at all
do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'is_moderator', 'UPDATE') then
    raise exception 'FAIL 1: authenticated can write is_moderator — the flag is self-grantable';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'is_moderator', 'SELECT') then
    raise exception 'FAIL 1: authenticated can read is_moderator — moderators are enumerable';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'is_moderator', 'UPDATE') then
    raise exception 'FAIL 1: anon can write is_moderator';
  end if;
  raise notice 'PASS 1: is_moderator is neither readable nor writable by a client';
end $$;

-- PASS 2: the audit trail is append-only by privilege, not by convention
do $$
declare bad text;
begin
  select string_agg(p, ', ') into bad
  from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
  where has_table_privilege('authenticated', 'public.moderation_actions', p);
  if bad is not null then
    raise exception 'FAIL 2: authenticated can % on moderation_actions', bad;
  end if;
  if has_table_privilege('anon', 'public.moderation_actions', 'SELECT') then
    raise exception 'FAIL 2: anon can read moderation_actions';
  end if;
  raise notice 'PASS 2: moderation_actions cannot be read, forged, rewritten or erased';
end $$;

-- PASS 3: anon holds no execute anywhere. GRANTS LAW — `revoke from public`
-- alone once passed both suites and still answered 200 to the anon key.
do $$
declare f text; bad text := '';
begin
  foreach f in array array[
    'public.moderation_queue()',
    'public.resolve_report(text, uuid, text, text)',
    'public.set_user_banned(uuid, boolean, text)',
    'public.moderation_log(integer)',
    'public.is_moderator()']
  loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      bad := bad || ' ' || f;
    end if;
  end loop;
  if bad <> '' then
    raise exception 'FAIL 3: anon can execute:%', bad;
  end if;
  raise notice 'PASS 3: anon can execute none of the moderation RPCs';
end $$;

-- PASS 3b: anon holds no write on ANY public table.
--
-- Class-level, and this file is where it belongs: hosted granted anon
-- INSERT/UPDATE/DELETE/TRUNCATE on all 21 tables while every per-table
-- assertion passed locally, because a local reset never issued those grants.
-- 20-grants.sql now simulates them, so this predicate has something to bite.
do $$
declare bad text;
begin
  select string_agg(distinct table_name, ', ' order by table_name) into bad
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if bad is not null then
    raise exception 'FAIL 3b: anon can write: %', bad;
  end if;
  raise notice 'PASS 3b: anon holds no write privilege on any public table';
end $$;

-- PASS 4: every entry point refuses a signed-in non-moderator
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare n int;
begin
  if public.is_moderator() then
    raise exception 'FAIL 4: an ordinary member reports as a moderator';
  end if;

  begin
    select count(*) into n from public.moderation_queue();
    raise exception 'FAIL 4: a non-moderator opened the queue and read % rows', n;
  exception when others then
    if sqlerrm <> 'not a moderator' then raise; end if;
  end;

  begin
    perform public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001', 'dismiss');
    raise exception 'FAIL 4: a non-moderator resolved a report';
  exception when others then
    if sqlerrm <> 'not a moderator' then raise; end if;
  end;

  begin
    perform public.set_user_banned('cccccccc-cccc-cccc-cccc-cccccccccccc', true);
    raise exception 'FAIL 4: a non-moderator banned someone';
  exception when others then
    if sqlerrm <> 'not a moderator' then raise; end if;
  end;

  begin
    select count(*) into n from public.moderation_log();
    raise exception 'FAIL 4: a non-moderator read the audit trail';
  exception when others then
    if sqlerrm <> 'not a moderator' then raise; end if;
  end;

  raise notice 'PASS 4: queue, resolve, ban and log all refuse a non-moderator';
end $$;

-- PASS 5: the queue collapses reports per CONTENT, and resolving clears them all
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare r record;
begin
  select * into r from public.moderation_queue();
  if r.kind <> 'comment' or r.report_count <> 2 or not r.already_hidden then
    raise exception 'FAIL 5: queue row was (%, %, %)', r.kind, r.report_count, r.already_hidden;
  end if;
  if (select count(*) from public.moderation_queue()) <> 1 then
    raise exception 'FAIL 5: two reporters produced two rows of work';
  end if;
  raise notice 'PASS 5: two reports on one comment are one row of work';
end $$;

-- PASS 6: dismissing UN-hides. Three bad-faith reports auto-hide a comment, so
-- if a dismissal left it hidden, brigading would be a permanent mute.
do $$
begin
  perform public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001',
                                'dismiss', 'reported for disagreeing');
  if (select auto_hidden from public.title_comments
       where id = 'c0000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL 6: a dismissed comment is still auto-hidden';
  end if;
  if (select count(*) from public.comment_reports
       where comment_id = 'c0000000-0000-4000-8000-000000000001'
         and resolved_at is null) <> 0 then
    raise exception 'FAIL 6: a report row survived the resolution and will redisplay';
  end if;
  if (select count(*) from public.moderation_queue()) <> 0 then
    raise exception 'FAIL 6: resolved work is still in the queue';
  end if;
  raise notice 'PASS 6: dismiss un-hides, closes every report row, and clears the queue';
end $$;

-- PASS 7: the action leaves a record naming who, whom and why
do $$
declare r record;
begin
  select * into r from public.moderation_log(1);
  if r.action <> 'dismiss' or r.moderator_name <> 'Ana'
     or r.target_name <> 'Ben' or r.note <> 'reported for disagreeing' then
    raise exception 'FAIL 7: audit row was (%, %, %, %)',
      r.action, r.moderator_name, r.target_name, r.note;
  end if;
  raise notice 'PASS 7: the audit trail names the moderator, the target and the reason';
end $$;

-- PASS 8: the guards on the action itself
do $$
begin
  begin
    perform public.set_user_banned('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
    raise exception 'FAIL 8: a moderator moderated themselves';
  exception when others then
    if sqlerrm <> 'you cannot moderate yourself' then raise; end if;
  end;

  -- the kind is what stops the id being pointed at some other table
  begin
    perform public.resolve_report('profile', 'c0000000-0000-4000-8000-000000000001', 'dismiss');
    raise exception 'FAIL 8: resolve_report accepted an unknown kind';
  exception when others then
    if sqlerrm <> 'that is not something you can moderate' then raise; end if;
  end;

  begin
    perform public.resolve_report('comment', 'c0000000-0000-4000-8000-000000000001', 'delete');
    raise exception 'FAIL 8: resolve_report accepted an unknown action';
  exception when others then
    if sqlerrm <> 'that is not an action' then raise; end if;
  end;

  raise notice 'PASS 8: self-moderation, unknown kinds and unknown actions are all refused';
end $$;

-- PASS 9: lifting a ban is its own recorded action. A ban that is quietly
-- undone looks identical to one that never happened.
do $$
begin
  perform public.set_user_banned('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, 'appealed');
  if (select action from public.moderation_log(1)) <> 'unban' then
    raise exception 'FAIL 9: the unban is not the newest entry in the log';
  end if;
  raise notice 'PASS 9: unbanning is recorded, and clock_timestamp keeps the order true';
end $$;

-- PASS 10: blocking notifies us (guideline 1.2). A block used to write
-- user_blocks and stop there, so the strongest signal a user can send about
-- someone reached nobody who could act on it. It now files a report for the
-- blocked person's latest message, which puts it in the same queue under the
-- same 24-hour clock.
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dan@test.dev', '{"display_name":"Dan"}', now(), now())
on conflict do nothing;

-- Ben is banned by this point in the file, so the pair is Cara and Dan.
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Block Test Crew',
        'cccccccc-cccc-cccc-cccc-cccccccccccc')
on conflict do nothing;
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', 'member')
on conflict do nothing;
update public.profiles set accepted_terms_at = now()
 where id in ('cccccccc-cccc-cccc-cccc-cccccccccccc',
              'dddddddd-dddd-dddd-dddd-dddddddddddd');

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
do $$
declare v_dm uuid;
begin
  v_dm := public.start_dm('cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.send_message(v_dm, 'something vile');
end $$;

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare v_dm uuid; c int; r text;
begin
  select id into v_dm from public.conversations
   where kind = 'dm'
     and (dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
       or dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.block_user('dddddddd-dddd-dddd-dddd-dddddddddddd', v_dm, 'harassment');

  select count(*), max(reason) into c, r from public.message_reports
   where reporter_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if c <> 1 then
    raise exception 'FAIL 10: a block filed % reports (want 1)', c;
  end if;
  if r not like '%via block%' then
    raise exception 'FAIL 10: the report does not say it came from a block (%)', r;
  end if;
  raise notice 'PASS 10: blocking files a report so the developer is notified';
end $$;

-- PASS 11: and blocking without a conversation still works (Profile has no
-- thread context), it simply files nothing.
do $$
declare c int;
begin
  perform public.block_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select count(*) into c from public.message_reports
   where reporter_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if c <> 1 then
    raise exception 'FAIL 11: a contextless block filed a report (total=%)', c;
  end if;
  raise notice 'PASS 11: a block with no conversation still blocks, and reports nothing';
end $$;

reset role;
rollback;

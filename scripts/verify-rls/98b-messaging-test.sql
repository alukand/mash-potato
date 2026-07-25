-- Messaging RLS twin: DMs, the request gate, group-bound chats, and blocking
-- on vanilla Postgres. Plain-SQL port of supabase/tests/messaging_test.sql
-- (the security-critical subset; the pgTAP file carries the full 72).
-- Cast: Ana (owner) + Ben (member) share "Test Crew"; Cara and Dan are
-- strangers.

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

update public.profiles set accepted_terms_at = now();

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- PASS 1: the group's chat exists, created by the trigger
do $$
declare n int;
begin
  select count(*) into n from public.conversations
   where kind = 'group' and group_id = '99999999-9999-9999-9999-999999999999';
  if n <> 1 then raise exception 'FAIL 1: expected one group chat, got %', n; end if;
  raise notice 'PASS 1: a group gets its chat from the trigger';
end $$;

-- PASS 2: membership is structural (no roster row anywhere)
do $$
begin
  if not public.is_conversation_member(
       (select id from public.conversations where kind = 'group')) then
    raise exception 'FAIL 2: the owner is not a member of the group chat';
  end if;
  raise notice 'PASS 2: group-chat membership comes from group_members';
end $$;

-- PASS 3: an outsider sees nothing (this is the predicate realtime evaluates)
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.conversations where kind = 'group';
  if n <> 0 then raise exception 'FAIL 3: an outsider saw % group chats', n; end if;
  raise notice 'PASS 3: an outsider selects zero group chats';
end $$;

-- PASS 4: a groupmate DM opens ACCEPTED and is idempotent both directions
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
declare a uuid; b uuid; st text;
begin
  a := public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  a := public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  select request_state into st from public.conversations where id = a;
  if st <> 'accepted' then raise exception 'FAIL 4: groupmate DM was %', st; end if;
  perform set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
  b := public.start_dm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  if a <> b then raise exception 'FAIL 4: the reverse pair made a second thread'; end if;
  raise notice 'PASS 4: one DM per pair, groupmates skip the request gate';
end $$;

-- PASS 5: a stranger lands PENDING and gets exactly one message
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare c uuid; st text;
begin
  c := public.start_dm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select request_state into st from public.conversations where id = c;
  if st <> 'pending' then raise exception 'FAIL 5: a stranger DM was %', st; end if;
  perform public.send_message(c, 'hi there');
  begin
    perform public.send_message(c, 'hello? hello?');
    raise exception 'FAIL 5: a second pre-acceptance message was allowed';
  exception when raise_exception then
    if sqlerrm <> 'wait for them to accept before sending more' then raise; end if;
  end;
  raise notice 'PASS 5: strangers land pending and get one message';
end $$;

-- PASS 6: a decline is invisible to the requester and is not an oracle
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
do $$
declare d uuid;
begin
  d := public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  perform public.send_message(d, 'hey');
  perform set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
  perform public.decline_dm_request(d);
  if exists (select 1 from public.conversations where id = d) then
    raise exception 'FAIL 6: the decliner can still see the thread';
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true);
  if not exists (select 1 from public.conversations where id = d) then
    raise exception 'FAIL 6: the requester lost the thread (a decline leaked)';
  end if;
  if exists (select 1 from public.dm_request_declines) then
    raise exception 'FAIL 6: the requester can read the tombstone';
  end if;
  begin
    perform public.send_message(d, 'still there?');
    raise exception 'FAIL 6: a declined sender could still send';
  exception when raise_exception then
    -- the SAME message as a block: the error must not be an oracle
    if sqlerrm <> 'this conversation is not open' then raise; end if;
  end;
  raise notice 'PASS 6: a decline is silent, and its error is not an oracle';
end $$;

-- PASS 7: blocking STOPS a DM in both directions.
-- Ana accepts Cara's request first, deliberately: blocking someone whose
-- request is still PENDING also writes a decline tombstone, and unblocking
-- does NOT clear it (unblock restores visibility, not consent). Testing the
-- block on an ACCEPTED thread isolates the block itself.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
declare c uuid;
begin
  select id into c from public.conversations
   where kind = 'dm' and (dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                       or dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.accept_dm_request(c);
  perform public.block_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
  begin
    perform public.send_message(c, 'blocked?');
    raise exception 'FAIL 7: the blocker could still send';
  exception when raise_exception then
    if sqlerrm <> 'this conversation is not open' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
  begin
    perform public.send_message(c, 'why?');
    raise exception 'FAIL 7: the BLOCKED user could still send';
  exception when raise_exception then
    if sqlerrm <> 'this conversation is not open' then raise; end if;
  end;
  raise notice 'PASS 7: a block stops the DM in both directions';
end $$;

-- PASS 8: unblock restores it (the RPC the app never had)
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
declare c uuid;
begin
  select id into c from public.conversations
   where kind = 'dm' and (dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                       or dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.unblock_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
  perform public.send_message(c, 'sorry, misclick');
  raise notice 'PASS 8: unblock_user restores sending';
end $$;

-- PASS 9: every write path is RPC-only
do $$
begin
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ((select id from public.conversations limit 1),
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'direct');
    raise exception 'FAIL 9: a direct insert into messages succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.messages set removed = true;
    raise exception 'FAIL 9: a direct update of messages succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.conversation_participants (conversation_id, user_id)
    values ((select id from public.conversations limit 1),
            'cccccccc-cccc-cccc-cccc-cccccccccccc');
    raise exception 'FAIL 9: a direct insert into the roster succeeded';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 9: messages and the roster take no direct writes';
end $$;

-- PASS 10: the realtime + replica-identity posture that keeps DMs private
do $$
declare n int; ident text;
begin
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime'
     and tablename in ('conversations','messages','message_reactions','conversation_state');
  if n <> 4 then raise exception 'FAIL 10: expected 4 published tables, got %', n; end if;
  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename = 'conversation_participants';
  if n <> 0 then
    raise exception 'FAIL 10: the roster is published (DELETE events bypass RLS)';
  end if;
  select relreplident::text into ident from pg_class
   where oid = 'public.messages'::regclass;
  if ident <> 'd' then
    raise exception 'FAIL 10: messages replica identity is %, must stay default', ident;
  end if;
  raise notice 'PASS 10: realtime publication and replica identity are correct';
end $$;

-- PASS 11: the internals are sealed from clients
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array['dm_request_declined','touch_conversation_activity',
                               'notify_new_message','auto_hide_reported_message',
                               'create_group_conversation'])
    and has_function_privilege('authenticated', p.oid, 'execute');
  if bad is not null then
    raise exception 'FAIL 11: authenticated can execute internals: %', bad;
  end if;
  raise notice 'PASS 11: messaging trigger internals are sealed';
end $$;

-- PASS 12: anon can touch none of it
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array['conversations','conversation_participants',
                               'conversation_state','messages','message_reactions',
                               'message_reports','dm_request_declines'])
    and has_table_privilege('anon', c.oid, 'select');
  if bad is not null then
    raise exception 'FAIL 12: anon can select from: %', bad;
  end if;
  raise notice 'PASS 12: anon has no read on any messaging table';
end $$;

do $$ begin raise notice '=== ALL 12 MESSAGING ASSERTIONS PASSED ==='; end $$;

rollback;

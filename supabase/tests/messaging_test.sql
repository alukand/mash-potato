-- Messaging: DMs (with the request gate), group-bound chats, custom chats,
-- and the moderation kit, proven against live RLS. Run: npx supabase test db.
--
-- The load-bearing claims under test:
--   * membership is STRUCTURAL — a group chat auto-syncs with group_members
--   * two people can never hold two DM threads
--   * a decline is invisible to the requester, and its error is not an oracle
--   * blocking STOPS a DM (it can only hide in a group chat)
--   * every write is RPC-only
--   * the realtime publication + RLS posture that makes DMs private
--
-- Cast: Ana (owner) + Ben (member) share "Test Crew". Cara and Dan are
-- strangers to everyone.

create extension if not exists pgtap with schema extensions;

begin;
select plan(72);

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

update public.profiles set accepted_terms_at = now();

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- ============================ group-bound chat ==============================

-- 1
select is(
  (select count(*)::int from public.conversations
    where kind = 'group' and group_id = '99999999-9999-9999-9999-999999999999'),
  1, 'group chat: created by trigger when the group was created');

-- 2
select ok(
  public.is_conversation_member(
    (select id from public.conversations where group_id = '99999999-9999-9999-9999-999999999999')),
  'group chat: the owner is a member through group_members');

-- 3
select throws_ok(
  $$insert into public.conversations (kind, group_id, created_by)
    values ('group', '99999999-9999-9999-9999-999999999999',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501', null, 'group chat: a second one cannot be inserted (RPC-only writes)');

-- 4: Ben is a member too
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select ok(
  public.is_conversation_member(
    (select id from public.conversations where group_id = '99999999-9999-9999-9999-999999999999')),
  'group chat: a plain member is a member of the chat');

-- 5: Cara is not
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select ok(
  not public.is_conversation_member(
    (select id from public.conversations where group_id = '99999999-9999-9999-9999-999999999999')),
  'group chat: an outsider is not a member');

-- 6: and cannot see it at all
select is((select count(*)::int from public.conversations where kind = 'group'), 0,
  'group chat: an outsider selects zero rows (this is what realtime evaluates)');

-- ============================== DM identity =================================

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- 7
select ok(public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') is not null,
  'dm: a groupmate DM opens');

-- 8
select is(
  (select request_state from public.conversations where kind = 'dm'),
  'accepted', 'dm: a groupmate skips the request gate');

-- 9
select is(public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
          (select id from public.conversations where kind = 'dm'),
  'dm: start_dm is idempotent for the same pair');

-- 10: the other direction resolves to the same row
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(public.start_dm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
          (select id from public.conversations where kind = 'dm'),
  'dm: the reverse pair resolves to the SAME conversation (sorted dm_key)');

-- 11
select is((select count(*)::int from public.conversations where kind = 'dm'), 1,
  'dm: still exactly one thread for the pair');

-- 12
select is((select dm_key from public.conversations
            where group_id = '99999999-9999-9999-9999-999999999999'), null,
  'dm_key: null for a group conversation');

-- 13: self-DM refused
select throws_ok(
  $$select public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  'P0001', 'pick someone else', 'dm: you cannot DM yourself');

-- ============================ the request gate ==============================

-- Cara (a stranger) messages Ana
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

-- 14
select ok(public.start_dm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null,
  'request: a stranger can open a DM');

-- 15
select is(
  (select request_state from public.conversations c
    where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                          or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
  'pending', 'request: a stranger lands PENDING, not accepted');

-- 16: one message is allowed
select lives_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'hi, saw your Dune take')$$,
  'request: the first message is allowed through');

-- 17: the second is not
select throws_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'hello? hello?')$$,
  'P0001', 'wait for them to accept before sending more',
  'request: a second message before acceptance is refused');

-- 18: Ana can read the pending request
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select count(*)::int from public.messages m
           join public.conversations c on c.id = m.conversation_id
           where c.request_state = 'pending'), 1,
  'request: the recipient can read the one pending message');

-- 19: the requester cannot accept their own request
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.accept_dm_request(
      (select c.id from public.conversations c where c.request_state = 'pending'))$$,
  'P0001', 'they have not answered yet',
  'request: the requester cannot accept on the recipient''s behalf');

-- 20: Ana replies, which IS the acceptance
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select lives_ok(
  $$select public.send_message(
      (select c.id from public.conversations c where c.request_state = 'pending'),
      'ha, thanks')$$,
  'request: the recipient replying is allowed');

-- 21
select is(
  (select count(*)::int from public.conversations where request_state = 'pending'), 0,
  'request: replying flips the thread to accepted');

-- 22: now Cara can send freely
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select lives_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'anyway, part three?')$$,
  'request: after acceptance the requester can send again');

-- ---- decline, from Dan this time ----
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as dan_dm \gset
select public.send_message(:'dan_dm', 'hey') as _sent \gset

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
-- 23
select lives_ok($$select public.decline_dm_request('$$ || :'dan_dm' || $$')$$,
  'decline: the recipient can decline');

-- 24
select is((select count(*)::int from public.conversations where id = :'dan_dm'), 0,
  'decline: the thread disappears for the decliner');

-- 25
select is((select count(*)::int from public.dm_request_declines), 1,
  'decline: the decliner can see their own tombstone');

-- 26: the requester still sees their own message — indistinguishable from silence
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select is((select count(*)::int from public.conversations where id = :'dan_dm'), 1,
  'decline: the REQUESTER still sees the thread (ghosting, not a notice)');

-- 27
select is((select count(*)::int from public.dm_request_declines), 0,
  'decline: the requester can never read the tombstone');

-- 28: and the refusal is the same string as being blocked, so it is no oracle
select throws_ok(
  $$select public.send_message('$$ || :'dan_dm' || $$', 'still there?')$$,
  'P0001', 'this conversation is not open',
  'decline: the next send fails with the same message as a block (no oracle)');

-- 29
select throws_ok(
  $$select public.start_dm('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  'P0001', 'this conversation is not open',
  'decline: re-requesting is refused with that same message');

-- 30: dm_request_declined is not callable by clients (it would be a probe)
select ok(
  not has_function_privilege('authenticated', 'public.dm_request_declined(uuid)', 'execute'),
  'decline: dm_request_declined is sealed from authenticated');

-- ============================== blocking ====================================

-- Ana blocks Cara
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.block_user('cccccccc-cccc-cccc-cccc-cccccccccccc') as _b \gset

-- 31
select is((select count(*)::int from public.user_blocks
            where blocker_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1,
  'block: the row is written');

-- 32: the BLOCKER cannot send
select throws_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'blocked?')$$,
  'P0001', 'this conversation is not open',
  'block: the blocker cannot send in that DM');

-- 33: and neither can the BLOCKED party — a block stops both directions
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'why?')$$,
  'P0001', 'this conversation is not open',
  'block: the BLOCKED user is stopped too (not merely hidden)');

-- 34
select throws_ok(
  $$select public.start_dm('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'this conversation is not open',
  'block: start_dm with someone who blocked you is refused');

-- 35: messages are hidden both ways
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select count(*)::int from public.messages m
           where m.sender_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 0,
  'block: the blocked user''s messages are invisible to the blocker');

-- 36: unblock restores it
select lives_ok($$select public.unblock_user('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'block: unblock_user exists and runs');

-- 37
select ok((select count(*)::int from public.messages m
           where m.sender_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') > 0,
  'block: unblocking restores visibility');

-- 38
select lives_ok(
  $$select public.send_message(
      (select c.id from public.conversations c
        where c.kind = 'dm' and (c.dm_user_a = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                              or c.dm_user_b = 'cccccccc-cccc-cccc-cccc-cccccccccccc')),
      'sorry, misclick')$$,
  'block: unblocking restores sending');

-- 39: you cannot unblock yourself out of someone else's block
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select public.block_user('dddddddd-dddd-dddd-dddd-dddddddddddd') as _b2 \gset
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select public.unblock_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _b3 \gset
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*)::int from public.user_blocks
            where blocker_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1,
  'block: the blocked party cannot delete the blocker''s row');

-- ========================= the validation ladder ============================

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select id as gchat from public.conversations
 where group_id = '99999999-9999-9999-9999-999999999999' \gset

-- 40
select throws_ok(
  $$select public.send_message('$$ || :'gchat' || $$', '')$$,
  'P0001', 'messages must be 1 to 4000 characters', 'ladder: empty body rejected');

-- 41
select throws_ok(
  $$select public.send_message('$$ || :'gchat' || $$', repeat('x', 4001))$$,
  'P0001', 'messages must be 1 to 4000 characters', 'ladder: over-long body rejected');

-- 42: the wordlist applies (seeding a term needs the superuser: banned_terms
-- is deliberately unreadable and unwritable by clients)
reset role;
insert into public.banned_terms (term) values ('slurword') on conflict do nothing;
set local role authenticated;
select throws_ok(
  $$select public.send_message('$$ || :'gchat' || $$', 'you slurword')$$,
  'P0001', 'that message contains language that is not allowed here',
  'ladder: the banned-terms wordlist applies to messages');

-- 43: word boundaries, not substrings
select lives_ok(
  $$select public.send_message('$$ || :'gchat' || $$', 'slurwording is not a word')$$,
  'ladder: the wordlist matches whole words only');

-- 44: the terms gate fires BEFORE the wordlist
reset role;
update public.profiles set accepted_terms_at = null
 where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select throws_ok(
  $$select public.start_dm('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'P0001', 'accept the community terms first',
  'ladder: the terms gate fires before anything else');

-- 45: a banned account is stopped before the terms gate
reset role;
update public.profiles set banned = true, accepted_terms_at = null
 where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select throws_ok(
  $$select public.start_dm('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'P0001', 'messaging is disabled for this account',
  'ladder: a banned account is refused before the terms gate');
reset role;
update public.profiles set banned = false, accepted_terms_at = now()
 where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set local role authenticated;

-- 46: a non-member cannot send into the group chat
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok(
  $$select public.send_message('$$ || :'gchat' || $$', 'let me in')$$,
  'P0001', 'this conversation is not open',
  'ladder: an outsider cannot send into a group chat');

-- 47: a reply must belong to the same conversation
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select id as foreign_msg from public.messages
 where conversation_id <> :'gchat' order by created_at limit 1 \gset
select throws_ok(
  $$select public.send_message('$$ || :'gchat' || $$', 'reply', '$$ || :'foreign_msg' || $$')$$,
  'P0001', 'reply does not match the conversation',
  'ladder: a reply cannot cross conversations');

-- ============================ RPC-only writes ===============================

-- 48
select throws_ok($$insert into public.messages (conversation_id, sender_id, body)
                   values ('$$ || :'gchat' || $$',
                           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'direct')$$,
  '42501', null, 'writes: direct insert into messages is denied');

-- 49
select throws_ok($$update public.messages set removed = true$$,
  '42501', null, 'writes: direct update of messages is denied');

-- 50
select throws_ok($$insert into public.conversation_participants
                   (conversation_id, user_id)
                   values ('$$ || :'gchat' || $$',
                           'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501', null, 'writes: direct insert into the roster is denied');

-- 51
select throws_ok($$update public.conversation_state set last_read_at = now()$$,
  '42501', null, 'writes: direct update of read state is denied');

-- 52
select throws_ok($$insert into public.message_reactions
                   (message_id, conversation_id, user_id, kind)
                   values ('$$ || :'foreign_msg' || $$', '$$ || :'gchat' || $$',
                           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'like')$$,
  '42501', null, 'writes: direct insert into reactions is denied');

-- 53
select throws_ok($$select * from public.banned_terms$$,
  '42501', null, 'writes: banned_terms stays unreadable');

-- ========================== unread + read state =============================

select public.send_message(:'gchat', 'unread one') as _u1 \gset
select public.send_message(:'gchat', 'unread two') as _u2 \gset

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
-- 54
select ok((select unread_count from public.my_inbox() where conversation_id = :'gchat') >= 2,
  'unread: a member sees the unread count');

-- 55
select lives_ok($$select public.mark_conversation_read('$$ || :'gchat' || $$')$$,
  'unread: mark_conversation_read runs');

-- 56
select is((select unread_count from public.my_inbox() where conversation_id = :'gchat'), 0,
  'unread: marking read clears the count');

-- 57: your own messages never count
select public.send_message(:'gchat', 'mine') as _u3 \gset
select is((select unread_count from public.my_inbox() where conversation_id = :'gchat'), 0,
  'unread: your own message does not make itself unread');

-- 58: the group chat appears with no conversation_state row at all
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select ok((select count(*)::int from public.my_inbox() where conversation_id = :'gchat') = 1,
  'inbox: a group chat shows up with lazily-absent read state');

-- 59: read receipts are visible to a member
select ok((select count(*)::int from public.conversation_read_receipts(:'gchat')) >= 1,
  'receipts: a member can read the watermarks');

-- 60: an outsider gets nothing
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is((select count(*)::int from public.conversation_read_receipts(:'gchat')), 0,
  'receipts: an outsider gets no watermarks');

-- 61: another member's mute is never readable
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select public.set_conversation_prefs(:'gchat', true, null) as _m \gset
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select count(*)::int from public.conversation_state
            where user_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'prefs: nobody can read another member''s mute/archive');

-- ============================== custom chats ================================

-- 62: a stranger cannot be dragged in (the request gate has no back door)
select throws_ok(
  $$select public.create_group_chat('Film Nerds',
      array['dddddddd-dddd-dddd-dddd-dddddddddddd']::uuid[])$$,
  'P0001', 'you can only add people you already share a group or a chat with',
  'custom: you cannot add someone you could not DM');

-- 63
select public.create_group_chat('Film Nerds',
  array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[]) as custom_id \gset
select is((select title from public.conversations where id = :'custom_id'), 'Film Nerds',
  'custom: a chat with a groupmate is created');

-- 64
select is((select count(*)::int from public.conversation_participants
            where conversation_id = :'custom_id'), 2,
  'custom: creator and invitee both get roster rows');

-- 65
select throws_ok(
  $$select public.leave_chat('$$ || :'gchat' || $$')$$,
  'P0001', 'this chat cannot be left',
  'custom: a group-bound chat cannot be left (leave the group instead)');

-- 66: a non-owner cannot rename
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$select public.rename_chat('$$ || :'custom_id' || $$', 'Hijacked')$$,
  'P0001', 'only the chat owner can rename it',
  'custom: only the owner renames');

-- ============================== moderation ==================================

-- 67: one report hides a DM message (three reporters is unreachable there)
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select m.id as cara_msg from public.messages m
 where m.sender_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' limit 1 \gset
select public.report_message(:'cara_msg', 'rude') as _r \gset
select is((select count(*)::int from public.messages where id = :'cara_msg'), 0,
  'moderation: one report hides a DM message from the reporter');

-- 68: but the author still sees their own
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is((select count(*)::int from public.messages where id = :'cara_msg'), 1,
  'moderation: the author still sees their own hidden message');

-- 69: you cannot report yourself
select throws_ok(
  $$select public.report_message('$$ || :'cara_msg' || $$', 'oops')$$,
  'P0001', 'you cannot report your own message',
  'moderation: self-reporting is refused');

-- ====================== realtime + structural posture =======================

-- 70: the four published tables, and NOT the roster
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('conversations','messages','message_reactions','conversation_state')),
  4, 'realtime: the four messaging tables are published');

-- 71
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversation_participants'),
  0, 'realtime: the roster is NOT published (DELETE events bypass RLS)');

-- 72: messages must never carry the old row into the WAL
select is((select relreplident::text from pg_class
            where oid = 'public.messages'::regclass), 'd',
  'realtime: messages keeps default replica identity (never FULL)');

select * from finish();
rollback;

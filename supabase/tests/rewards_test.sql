-- Tokens: the private, capped, quality-weighted ledger. Run with:
--   npx supabase test db
--
-- Cast: Ana (A) does nearly everything; Ben (B) is her group-mate; Cara (C)
-- reacts, writes and gets removed; Dan (D) and Eve (E) report; Fay (F) is
-- banned; Max (M) moderates. Calls run as the owner with the caller's JWT
-- claims set, which is exactly what the definer RPCs see from a real client.
--
-- The final balances are asserted to the token, so every rule above them has
-- to have fired exactly as designed.

create extension if not exists pgtap with schema extensions;

begin;
select plan(51);

-- ---- cast and films ---------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'ana@test.dev', 'Ana'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'ben@test.dev', 'Ben'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'cara@test.dev', 'Cara'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'dan@test.dev', 'Dan'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'eve@test.dev', 'Eve'),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'fay@test.dev', 'Fay'),
    ('12121212-1212-1212-1212-121212121212'::uuid, 'max@test.dev', 'Max')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now();
update public.profiles set banned = true where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
update public.profiles set is_moderator = true where id = '12121212-1212-1212-1212-121212121212';

insert into public.titles (id, tmdb_id, media_type, name, year)
select ('f1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       880000 + n, 'movie', 'Film ' || n, 2020
  from generate_series(1, 12) as n;

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('f2000000-0000-4000-8000-000000000001', 'Token Crew', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('f2000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member')
on conflict do nothing;

-- A dev database may already have launched tokens (docs/REWARDS.md). Every run
-- starts from "not launched"; like everything here, it is rolled back. (That
-- the flag SHIPS off is asserted by the twin, which always starts empty.)
update public.feature_flags set enabled = false where key = 'rewards';
update public.token_program set started_at = null;

-- comment ids, by name (post_comment returns them)
create temp table takes (name text primary key, id uuid not null);

-- A long take that is real writing (370+ characters, 60+ words).
create temp table texts (name text primary key, body text not null);
insert into texts values
  ('long', 'The first hour moves like a slow tide, patient and confident, letting every frame '
           'breathe before the story tightens its grip. The lead performance carries real '
           'weight, especially in the quiet scenes where nothing is said and everything is '
           'felt. The score swells at exactly the right moments, and the final act lands with '
           'a punch I did not see coming at all.'),
  ('padded', repeat('great movie ', 30)),
  ('held', 'The first hour moves like a slow tide, patient and confident, letting every frame '
           'breathe before the story tightens its grip. The lead performance carries real '
           'weight, especially in the quiet scenes where nothing is said and everything is '
           'felt. The score swells at exactly the right moments!!!!!!!!!!!!!!');

-- ---- access ---------------------------------------------------------------------------

select is(
  (select string_agg(format('%s:%s:%s', t, r, p), ', ')
     from unnest(array['token_rules', 'token_program', 'token_accounts',
                       'token_ledger', 'token_ineligible']) t
     cross join unnest(array['anon', 'authenticated']) r
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege(r, 'public.' || t, p)),
  null,
  'no client role can read or write any token table');

select ok(
  not has_function_privilege('anon', 'public.my_rewards(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_daily_tokens(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.take_reward_open(uuid)', 'EXECUTE'),
  'anon cannot call the token RPCs');

select ok(
  has_function_privilege('authenticated', 'public.my_rewards(integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.claim_daily_tokens(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.take_reward_open(uuid)', 'EXECUTE'),
  'a signed-in user can call the token RPCs');

select ok(
  not has_function_privilege('authenticated',
    'public.award_tokens(uuid, text, integer, uuid, uuid, uuid, text, timestamptz, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reconcile_take(uuid)', 'EXECUTE'),
  'nobody signed in can call the award internals');

-- ---- before launch: off, and the baseline-to-be ----------------------------------------

-- Ana rates Film 1 and Film 2 and reviews Film 2, all before launch.
insert into public.global_ratings (user_id, title_id, scores) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1000000-0000-4000-8000-000000000001', '{"story": 7}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1000000-0000-4000-8000-000000000002', '{"story": 6}');
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into takes values ('a_f2', public.post_comment('f1000000-0000-4000-8000-000000000002', null, null, 'Before launch.'));

select is((select count(*)::int from public.token_ledger
             where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'off: ratings and takes earn nothing');

select throws_ok(
  $$select public.claim_daily_tokens('America/Chicago')$$,
  'P0001', 'tokens are not available right now',
  'off: the daily token cannot be claimed');

-- ---- launch: start fresh ------------------------------------------------------------------

update public.feature_flags set enabled = true where key = 'rewards';

select isnt((select started_at from public.token_program), null,
  'turning the flag on stamps the start');

select ok(
  exists (select 1 from public.token_ineligible
           where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
             and title_id = 'f1000000-0000-4000-8000-000000000001' and kind = 'rating')
  and exists (select 1 from public.token_ineligible
               where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                 and title_id = 'f1000000-0000-4000-8000-000000000002' and kind = 'take'),
  'start fresh: films already rated or reviewed are recorded as never paying');

delete from public.global_ratings
 where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and title_id = 'f1000000-0000-4000-8000-000000000001';
insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1000000-0000-4000-8000-000000000001', '{"story": 8}');
select is((select count(*)::int from public.token_ledger
             where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'start fresh: deleting a pre-launch rating and rating again still earns nothing');

-- ---- the daily token -------------------------------------------------------------------

select is((public.claim_daily_tokens('America/Chicago') ->> 'claimed')::boolean, true,
  'daily: the first claim of the day pays');
select is((public.claim_daily_tokens('America/Chicago') ->> 'claimed')::boolean, false,
  'daily: a second claim the same day does not');
select is((select tz from public.token_accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'America/Chicago', 'daily: the first claim sets the time zone');
select public.claim_daily_tokens('Asia/Tokyo');
select is((select tz from public.token_accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'America/Chicago', 'daily: the zone cannot change again within 30 days (no zone-hopping)');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((public.claim_daily_tokens('Mars/Olympus_Mons') ->> 'claimed')::boolean, true,
  'daily: an unknown zone still claims');
select is((select tz from public.token_accounts where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'UTC', 'daily: ...but is not stored');

-- ---- solo ratings ------------------------------------------------------------------------

insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1000000-0000-4000-8000-000000000003', '{"story": 9}');
select is(
  (select amount from public.token_ledger
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind = 'rating_solo'
      and title_id = 'f1000000-0000-4000-8000-000000000003'),
  1, 'solo: a first rating pays 1');

update public.global_ratings set scores = '{"story": 10}'
 where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and title_id = 'f1000000-0000-4000-8000-000000000003';
select is(
  (select count(*)::int from public.token_ledger
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind = 'rating_solo'),
  1, 'solo: changing a rating does not pay again');

insert into public.global_ratings (user_id, title_id, scores)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       ('f1000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, '{"story": 5}'
  from generate_series(4, 8) as n;
select is(
  (select count(*)::int from public.token_ledger
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind = 'rating_solo'),
  5, 'solo: capped at 5 films a day (the sixth rating, Film 8, earns nothing)');

insert into public.global_ratings (user_id, title_id, scores)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'f1000000-0000-4000-8000-000000000011', '{"story": 5}');
select is(
  (select count(*)::int from public.token_ledger where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  0, 'a banned account earns nothing');

-- ---- movie nights --------------------------------------------------------------------------

insert into public.reveal_sessions (id, group_id, title_id, created_by) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
   'f1000000-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001',
   'f1000000-0000-4000-8000-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001',
   'f1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Night 1 (Film 9): both lock, then the reveal.
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('f3000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story": 8}', true),
  ('f3000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story": 6}', true);
select is(
  (select count(*)::int from public.token_ledger
    where kind = 'rating_group' and title_id = 'f1000000-0000-4000-8000-000000000009'),
  0, 'movie night: nothing before the reveal');
update public.reveal_sessions set state = 'revealed', revealed_at = now()
 where id = 'f3000000-0000-4000-8000-000000000001';
select is(
  (select string_agg(amount::text, ',' order by user_id) from public.token_ledger
    where kind = 'rating_group' and title_id = 'f1000000-0000-4000-8000-000000000009'),
  '3,3', 'movie night: the reveal pays both locked cards 3');

-- Night 2 (Film 10): only Ana locks before the reveal.
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('f3000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story": 7}', true);
update public.reveal_sessions set state = 'revealed', revealed_at = now()
 where id = 'f3000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.token_ledger
    where kind = 'rating_group' and title_id = 'f1000000-0000-4000-8000-000000000010'),
  0, 'movie night: a round with one locked card is not a night (no 3x solo farming)');
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('f3000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story": 9}', true);
select is(
  (select count(*)::int from public.token_ledger
    where kind = 'rating_group' and title_id = 'f1000000-0000-4000-8000-000000000010'),
  2, 'movie night: a late card makes it a night, and pays both');

-- Night 3 (Film 3, which Ana already rated solo for 1).
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('f3000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"story": 9}', true),
  ('f3000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"story": 4}', true);
update public.reveal_sessions set state = 'revealed', revealed_at = now()
 where id = 'f3000000-0000-4000-8000-000000000003';
select is(
  (select amount from public.token_ledger
    where kind = 'rating_group' and title_id = 'f1000000-0000-4000-8000-000000000003'
      and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2, 'movie night: after a solo rating it tops the film up to 3, not 3 more');

insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f1000000-0000-4000-8000-000000000009', '{"story": 6}');
select is(
  (select count(*)::int from public.token_ledger
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and kind = 'rating_solo'),
  0, 'solo: after a movie night the film has already paid');

-- ---- takes ----------------------------------------------------------------------------------

select ok(public.take_is_substantial((select body from texts where name = 'long')),
  'quality: real writing passes');
select ok(not public.take_is_substantial((select body from texts where name = 'padded')),
  'quality: the same two words thirty times fails');
select ok(not public.take_is_substantial((select body from texts where name = 'held')),
  'quality: a held-down key fails');
select ok(not public.take_is_substantial(repeat('1234 5678 ', 40)),
  'quality: mostly numbers fails');
select ok(not public.take_is_substantial('Loved it.'),
  'quality: short fails');

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select ok(public.take_reward_open('f1000000-0000-4000-8000-000000000003'),
  'composer: a take on a new film can earn');
select ok(not public.take_reward_open('f1000000-0000-4000-8000-000000000002'),
  'composer: a pre-launch film cannot');

insert into takes values ('a_f3', public.post_comment('f1000000-0000-4000-8000-000000000003', null, null, 'Loved it.'));
select is(
  (select string_agg(kind || '=' || amount, ',' order by kind) from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f3')),
  'take=3', 'take: any length pays 3, a short one gets no bonus');

insert into takes values ('a_f3_again', public.post_comment('f1000000-0000-4000-8000-000000000003', null, null, 'Still love it.'));
select is(
  (select count(*)::int from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f3_again')),
  0, 'take: a second take on the same film pays nothing');

insert into takes values ('a_f9', public.post_comment('f1000000-0000-4000-8000-000000000009', null, null,
  (select body from texts where name = 'long')));
select is(
  (select string_agg(kind || '=' || amount || ':' || status, ',' order by kind) from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f9')),
  'take=3:available,take_bonus=2:pending', 'take: a long, real take adds a +2 bonus, pending');

insert into takes values ('a_f4', public.post_comment('f1000000-0000-4000-8000-000000000004', null, null,
  (select body from texts where name = 'padded')));
insert into takes values ('a_f5', public.post_comment('f1000000-0000-4000-8000-000000000005', null, null,
  (select body from texts where name = 'long') || ' Again.'));
select is(
  (select count(*)::int from public.token_ledger
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind = 'take'),
  3, 'take: capped at 3 a day (the padded one earned base only; the fourth earned nothing)');

-- Ben copies his own long take onto another film: base, no bonus.
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into takes values ('b_f9', public.post_comment('f1000000-0000-4000-8000-000000000009', null, null,
  (select body from texts where name = 'long')));
insert into takes values ('b_f10', public.post_comment('f1000000-0000-4000-8000-000000000010', null, null,
  (select body from texts where name = 'long')));
select is(
  (select string_agg(kind, ',' order by kind) from public.token_ledger
    where comment_id = (select id from takes where name = 'b_f10')),
  'take', 'take: a copy of your own earlier take gets no bonus');

-- ---- reactions --------------------------------------------------------------------------------

insert into public.comment_reactions (comment_id, user_id, kind)
values ((select id from takes where name = 'a_f9'), 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'like'),
       ((select id from takes where name = 'a_f9'), 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'fire'),
       ((select id from takes where name = 'a_f3'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'like');
select is(
  (select count(*)::int from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f9') and kind = 'take_reaction'),
  1, 'reaction: the first reaction from someone else pays +1, once');
select is(
  (select count(*)::int from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f3') and kind = 'take_reaction'),
  0, 'reaction: reacting to your own take pays nothing');

-- ---- the bonus, the hold, and clawbacks ----------------------------------------------------------

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((public.my_rewards() ->> 'pending')::int, 2,
  'hold: the bonus is pending, not spendable');

-- 48 hours pass for Ana's bonus.
update public.token_ledger set matures_at = now() - interval '1 minute'
 where comment_id = (select id from takes where name = 'a_f9') and kind = 'take_bonus';
select is((public.my_rewards() ->> 'pending')::int, 0,
  'hold: after 48 quiet hours the bonus is spendable');

-- Three reports hide it: everything that take earned is clawed back.
insert into public.comment_reports (comment_id, reporter_id)
select (select id from takes where name = 'a_f9'), r
  from unnest(array['cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']::uuid[]) as r;
select is(
  (select sum(amount)::int from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f9') and status <> 'void'),
  0, 'clawback: a take hidden by reports is worth nothing (base, bonus and reaction)');

-- A moderator dismisses the reports: it is restored.
set local request.jwt.claims to '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';
select public.resolve_report('comment', (select id from takes where name = 'a_f9'), 'dismiss', null);
select is(
  (select sum(amount)::int from public.token_ledger
    where comment_id = (select id from takes where name = 'a_f9') and status <> 'void'),
  6, 'restore: dismissing the reports gives all 6 back');

-- Ben deletes his long take inside the hold: the bonus never matures; the base stays.
update public.title_comments set deleted = true where id = (select id from takes where name = 'b_f9');
select is(
  (select string_agg(kind || ':' || status, ',' order by kind) from public.token_ledger
    where comment_id = (select id from takes where name = 'b_f9')),
  'take:available,take_bonus:void', 'hold: deleting inside 48 hours voids the bonus, keeps the base');

-- Cara rates and writes; a moderator removes it inside the hold.
insert into public.global_ratings (user_id, title_id, scores)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'f1000000-0000-4000-8000-000000000009', '{"story": 3}');
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
insert into takes values ('c_f9', public.post_comment('f1000000-0000-4000-8000-000000000009', null, null,
  (select body from texts where name = 'long')));
update public.title_comments set removed = true where id = (select id from takes where name = 'c_f9');
select is(
  (select sum(amount) filter (where status <> 'void')::int || '/' || count(*) filter (where status = 'void')::int
     from public.token_ledger where comment_id = (select id from takes where name = 'c_f9')),
  '0/1', 'removal: the base is clawed back and the pending bonus voided');

-- ---- balances, to the token ------------------------------------------------------------------------

-- Ana: daily 1 + solo 5 + movie nights 3+3+2 + takes 3+3+3 + bonus 2 + reaction 1 = 26
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((public.my_rewards() ->> 'balance')::int, 26, 'balance: Ana has exactly 26');
select is(jsonb_array_length(public.my_rewards() -> 'history'),
  (select count(*)::int from public.token_ledger where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'history: her ledger, all of it, and nobody else''s');

-- Ben: daily 1 + movie nights 3+3+3 + takes 3+3 = 16 (his bonus was voided)
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((public.my_rewards() ->> 'balance')::int, 16, 'balance: Ben has exactly 16');

-- Cara: solo 1; her removed take nets 0
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select is((public.my_rewards() ->> 'balance')::int, 1, 'balance: Cara has exactly 1');

-- ---- the kill switch ---------------------------------------------------------------------------------

update public.feature_flags set enabled = false where key = 'rewards';
insert into public.global_ratings (user_id, title_id, scores)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'f1000000-0000-4000-8000-000000000012', '{"story": 5}');
select is(
  (select count(*)::int from public.token_ledger
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and kind = 'rating_solo'),
  1, 'kill switch: with the flag off, nothing new earns');
select is((public.my_rewards() ->> 'enabled')::boolean, false,
  'kill switch: the app is told rewards are off');

select * from finish();
rollback;

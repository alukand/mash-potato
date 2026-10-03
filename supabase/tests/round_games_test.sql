-- Round games: the fight over the biggest split, and the best-take vote.
-- Run with: npx supabase test db
--
-- Cast: Gina owns "Popcorn Court"; Hal, Ivy and Jon are members; Kit is an
-- outsider and the moderator. Jon has not accepted the community terms.
--
-- Night 1 (Heat, blind takes): Gina 9 and Hal 3 on Pacing, Ivy 6. The reveal
-- starts the fight Gina vs Hal; Jon scores late and judges with Ivy.
-- Night 2 (Ronin, takes after the reveal): two cards, so no fight.
-- Night 3 (Thief): revealed on two cards; Ivy's late card starts the fight.
-- Night 4 (Collateral): fights switched off.

create extension if not exists pgtap with schema extensions;

begin;
select plan(93);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('e1000000-0000-4000-8000-000000000001'::uuid, 'gina@games.test', 'Gina'),
    ('e1000000-0000-4000-8000-000000000002'::uuid, 'hal@games.test', 'Hal'),
    ('e1000000-0000-4000-8000-000000000003'::uuid, 'ivy@games.test', 'Ivy'),
    ('e1000000-0000-4000-8000-000000000004'::uuid, 'jon@games.test', 'Jon'),
    ('e1000000-0000-4000-8000-000000000005'::uuid, 'kit@games.test', 'Kit')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now()
 where id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002',
              'e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005');
update public.profiles set is_moderator = true where id = 'e1000000-0000-4000-8000-000000000005';
insert into public.banned_terms (term) values ('zxqslur') on conflict do nothing;

-- No TMDB ids: a manual title can never collide with a real one already in
-- a developer's local database (titles_identity_key).
insert into public.titles (id, tmdb_id, media_type, name, year) values
  ('e3000000-0000-4000-8000-000000000001', null, 'movie', 'Heat', 1995),
  ('e3000000-0000-4000-8000-000000000002', null, 'movie', 'Ronin', 1998),
  ('e3000000-0000-4000-8000-000000000003', null, 'movie', 'Thief', 1981),
  ('e3000000-0000-4000-8000-000000000004', null, 'movie', 'Collateral', 2004);

insert into public.groups (id, name, owner_id)
values ('e2000000-0000-4000-8000-000000000001', 'Popcorn Court', 'e1000000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'member'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'member'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'member');

-- ======================= the owner's settings, and the round's row ==============
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.groups set takes_mode = 'blind' where id = 'e2000000-0000-4000-8000-000000000001';
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
reset role;
select is((select takes_mode from public.groups where id = 'e2000000-0000-4000-8000-000000000001'),
  'off', 'a member cannot change the group''s takes');
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.groups set takes_mode = 'blind' where id = 'e2000000-0000-4000-8000-000000000001';
select throws_ok(
  $$update public.groups set takes_mode = 'sometimes' where id = 'e2000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'takes are off, blind or after');

-- A client insert that tries to start revealed, back-dated, in another mode.
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric, state, revealed_at, created_at, takes_mode)
values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
        '[{"key":"story","label":"Story","weight":30},{"key":"pacing","label":"Pacing","weight":20},{"key":"acting","label":"Acting","weight":20}]',
        'revealed', now() + interval '3 days', now() - interval '3 days', 'off');
reset role;
select is(
  (select row(state, revealed_at, created_at = now(), takes_mode)::text
     from public.reveal_sessions where id = 'e4000000-0000-4000-8000-000000000001'),
  row('blind'::public.reveal_state, null::timestamptz, true, 'blind')::text,
  'a client insert starts blind, unrevealed, now, in the group''s takes mode');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$update public.reveal_sessions set state = 'revealed', revealed_at = now()
     where id = 'e4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'even the owner cannot update a round directly (the reveal is an RPC)');
select throws_ok(
  $$update public.reveal_sessions set revealed_at = now() - interval '2 days'
     where id = 'e4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'nor move its clock');

-- ======================= blind takes ============================================
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001',
      '  Pacing is the point: the long silences are the tension.  ')$$,
  'Hal writes a blind take');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'my_take' ->> 'body',
  'Pacing is the point: the long silences are the tension.',
  'Hal reads his own take back, trimmed');
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001', 'Total zxqslur.')$$,
  'P0001', 'that take contains language that is not allowed here', 'takes pass the wordlist');
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001', repeat('a', 501))$$,
  'P0001', 'keep your take to 500 characters', 'a take is 500 characters at most');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(
  (public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'takes') = 'null'::jsonb
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'my_take') = 'null'::jsonb,
  'THE ONE RULE: while blind, Ivy reads nobody''s take');
select lives_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001',
      'Overlong. Two great scenes stapled to a procedural.')$$,
  'Ivy writes hers');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001',
      'Every minute earns the diner scene.')$$,
  'Gina writes hers');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001', 'Fine.')$$,
  'P0001', 'accept the community terms first', 'a take needs the community terms');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'lock in your scores to vote', 'nobody votes before the reveal');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$select public.round_game_state('e4000000-0000-4000-8000-000000000001')$$,
  'P0001', 'that round is not in your groups', 'an outsider reads nothing');

-- Three cards: Pacing splits 9 / 3 / 6, everything else agrees.
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
   '{"story":7,"pacing":9,"acting":8}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002',
   '{"story":7,"pacing":3,"acting":7}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003',
   '{"story":8,"pacing":6,"acting":8}', true);

reset role;
insert into public.notification_config (endpoint, secret, bearer)
values ('http://push.test/send-push', 'test-secret', 'test-bearer');
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.reveal_session('e4000000-0000-4000-8000-000000000001')$$, 'Gina reveals');

-- ======================= the fight starts at the reveal =========================
reset role;
select is(
  (select row(category_key, category_label, high_member_id, high_score, low_member_id, low_score)::text
     from public.round_fights where session_id = 'e4000000-0000-4000-8000-000000000001'),
  row('pacing', 'Pacing', 'e1000000-0000-4000-8000-000000000001'::uuid, 9::numeric,
      'e1000000-0000-4000-8000-000000000002'::uuid, 3::numeric)::text,
  'the reveal starts a fight on the most split category: Gina 9 vs Hal 3');
select is(
  (select count(*)::int from net.http_request_queue
    where convert_from(body, 'utf8') like '%fight_started%'),
  2, 'both fighters get a push');
select is(
  (select count(*)::int from net.http_request_queue
    where convert_from(body, 'utf8') like '%fight_started%'
      and convert_from(body, 'utf8') ~ '(score|pacing|Pacing)'),
  0, 'the push is ID-only: no score, no category');
select is(
  (select takes_mode from public.reveal_sessions where id = 'e4000000-0000-4000-8000-000000000001'),
  'blind', 'the round kept the mode it started with');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(
  (public.round_game_state('e4000000-0000-4000-8000-000000000001') ->> 'sealed')::boolean
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'fight') = 'null'::jsonb
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'takes') = 'null'::jsonb,
  'THE ONE RULE: Jon has no card, so the fight and the takes stay sealed for him');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'lock in your scores to vote', 'and he cannot vote');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,phase}',
  'arguing', 'Ivy sees the fight: the fighters are arguing');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,me}',
  'judge', 'Ivy is a judge');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'judging is not open', 'no judging before both arguments are in');
select throws_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001', 'Me too')$$,
  'P0001', 'only the two fighters make arguments', 'a judge does not argue');
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000001', 'Changed my mind')$$,
  'P0001', 'takes for this round sealed at the reveal', 'blind takes are sealed at the reveal');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001', repeat('b', 281))$$,
  'P0001', 'keep your argument to 280 characters', 'an argument is 280 characters at most');
select lives_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001', 'The waiting IS the heist.')$$,
  'Gina makes her case');
select lives_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001',
      'The waiting IS the heist. Cut it and it is just guns.')$$,
  'and can still edit it while Hal has not answered');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,high,argument}',
  'The waiting IS the heist. Cut it and it is just guns.', 'Gina reads her own argument');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(
  (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,high,argued}')::boolean
  and public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{fight,high,argument}' = 'null'::jsonb,
  'Hal sees that Gina argued, but not what: sealed until both are in');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'fighters do not judge their own fight', 'a fighter does not judge');

-- Jon scores late, so he joins the reveal, the takes vote and the jury.
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$select public.late_score_session('e4000000-0000-4000-8000-000000000001',
      '{"story":6,"pacing":5,"acting":7}'::jsonb)$$,
  'Jon scores late');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,me}',
  'judge', 'and is a judge now');
reset role;
select is(
  (select high_member_id::text || low_member_id::text from public.round_fights
    where session_id = 'e4000000-0000-4000-8000-000000000001'),
  'e1000000-0000-4000-8000-000000000001e1000000-0000-4000-8000-000000000002',
  'a late card never changes a fight that has started');

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001',
      'Three hours. Admire the craft, but the middle hour sags.')$$,
  'Hal answers');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.save_fight_argument('e4000000-0000-4000-8000-000000000001', 'One more thing')$$,
  'P0001', 'arguments for this fight are closed', 'once both are in, the arguments stand');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,phase}',
  'judging', 'both in: judging opens');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,low,argument}',
  'Three hours. Admire the craft, but the middle hour sags.', 'and the judges read both sides');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000004')$$,
  'P0001', 'pick one of the two fighters', 'a fight vote picks a fighter');
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000002')$$,
  'Ivy votes Hal');
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000001')$$,
  'and switches to Gina');
select ok(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{fight,high,votes}' = 'null'::jsonb
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,voted}')::int = 1
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,judges}')::int = 2,
  'votes stay sealed until the bell: 1 of 2 judges, no tallies');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000001')$$,
  'Jon votes Gina, the last judge');
select is(
  (select row(r ->> 'phase', r ->> 'outcome', r ->> 'winner_id', r #>> '{high,votes}', r #>> '{low,votes}')::text
     from (select public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'fight' as r) x),
  row('closed', 'win', 'e1000000-0000-4000-8000-000000000001', '2', '0')::text,
  'every judge voted, so the bell rings: Gina wins 2-0');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
      'e1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'judging is not open', 'no votes after the bell');

-- ======================= the best-take vote (blind) =============================
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  jsonb_array_length(public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{takes,entries}'),
  3, 'the reveal drops all three takes together');
select ok(
  not (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{takes,closed}')::boolean
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{takes,can_vote}')::boolean
  and (public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{takes,eligible}')::int = 4,
  'voting is open to the four players');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000003')$$,
  'P0001', 'you cannot vote for your own take', 'nobody votes for their own take');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000004')$$,
  'P0001', 'that take is not open to votes', 'a vote goes to someone who wrote one');
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000002')$$,
  'Ivy votes for Hal''s take');
select ok(
  (select bool_and(e -> 'votes' = 'null'::jsonb)
     from jsonb_array_elements(public.round_game_state('e4000000-0000-4000-8000-000000000001')
            #> '{takes,entries}') e),
  'take tallies stay sealed while the vote is open');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000002')$$, 'Gina votes Hal');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000001')$$, 'Hal votes Gina');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000002')$$, 'Jon votes Hal, the last player');
select is(
  (select string_agg((e ->> 'author_id') || ':' || (e ->> 'votes') || ':' || (e ->> 'winner'), ','
                     order by e ->> 'author_id')
     from jsonb_array_elements(public.round_game_state('e4000000-0000-4000-8000-000000000001')
            #> '{takes,entries}') e),
  'e1000000-0000-4000-8000-000000000001:1:false,e1000000-0000-4000-8000-000000000002:3:true,e1000000-0000-4000-8000-000000000003:0:false',
  'everyone voted on a blind round, so it closes: Hal''s take wins 3-1-0');
select throws_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
      'e1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'voting on takes is over', 'no votes once it is closed');

-- ======================= the trophy shelf ======================================
select is(
  (select string_agg(user_id::text || ':' || take_wins || ':' || fight_wins, ',' order by user_id)
     from public.group_trophies('e2000000-0000-4000-8000-000000000001')),
  'e1000000-0000-4000-8000-000000000001:0:1,e1000000-0000-4000-8000-000000000002:1:0,e1000000-0000-4000-8000-000000000003:0:0,e1000000-0000-4000-8000-000000000004:0:0',
  'the shelf: Gina won the fight, Hal the best take');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$select * from public.group_trophies('e2000000-0000-4000-8000-000000000001')$$,
  'P0001', 'not a member of this group', 'the shelf is the group''s own');

-- ======================= reports, the queue, and moderation =====================
reset role;
create temporary table hal_take on commit drop as
  select id from public.round_posts
   where session_id = 'e4000000-0000-4000-8000-000000000001'
     and author_id = 'e1000000-0000-4000-8000-000000000002' and kind = 'take';
grant select on hal_take to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  format($$select public.report_round_post(%L, 'rude')$$, (select id from hal_take)),
  'P0001', 'that post is not available', 'an outsider cannot report it');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  format($$select public.report_round_post(%L, null)$$, (select id from hal_take)),
  'P0001', 'that post is not available', 'nor can its author');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(format($$select public.report_round_post(%L, 'mean')$$, (select id from hal_take)),
  'Gina reports Hal''s take');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(format($$select public.report_round_post(%L, null)$$, (select id from hal_take)),
  'Ivy reports it');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(format($$select public.report_round_post(%L, null)$$, (select id from hal_take)),
  'Jon reports it: the third report hides it');
select is(
  jsonb_array_length(public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{takes,entries}'),
  2, 'a hidden take leaves everyone''s view');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select e ->> 'hidden' from jsonb_array_elements(
     public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{takes,entries}') e
    where (e ->> 'mine')::boolean),
  'true', 'but its author still sees it, marked hidden');
select is(
  (select string_agg(user_id::text || ':' || take_wins, ',' order by user_id)
     from public.group_trophies('e2000000-0000-4000-8000-000000000001') where take_wins > 0),
  'e1000000-0000-4000-8000-000000000001:1',
  'a hidden take cannot win: the best take passes to Gina');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(
  (select row(kind, report_count, already_hidden)::text from public.moderation_queue()
    where content_id = (select id from hal_take)),
  row('take', 3, true)::text, 'the take lands in the moderation queue, already hidden');
select lives_ok(
  format($$select public.resolve_report('take', %L, 'dismiss', 'banter')$$, (select id from hal_take)),
  'the moderator dismisses the reports');
reset role;
select is(
  (select row(p.auto_hidden, (select count(*) from public.round_post_reports r
                               where r.post_id = p.id and r.resolved_at is null))::text
     from public.round_posts p where p.id = (select id from hal_take)),
  row(false, 0::bigint)::text, 'dismissing un-hides the take and closes every report on it');
select is(
  (select target_kind from public.moderation_actions where target_id = (select id from hal_take)),
  'take', 'and the audit trail records a take');

-- ======================= takes after the reveal (Ronin) ==========================
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.groups set takes_mode = 'after' where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001',
        '[{"key":"story","label":"Story","weight":30}]');
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000002', 'Too early')$$,
  'P0001', 'lock in your scores to write a take', 'after-mode takes wait for the reveal');
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', '{"story":9}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', '{"story":3}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.reveal_session('e4000000-0000-4000-8000-000000000002');
reset role;
select is(
  (select count(*)::int from public.round_fights where session_id = 'e4000000-0000-4000-8000-000000000002'),
  0, 'two cards are not a fight: nobody would be left to judge');
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000002', 'The car chases ARE the story.')$$,
  'Gina writes her take after the reveal');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000002', 'A briefcase is not a plot.')$$,
  'Hal writes his');
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000002', 'take',
      'e1000000-0000-4000-8000-000000000001')$$, 'Hal votes Gina');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000002', 'Edited after a vote')$$,
  'P0001', 'your take has votes now, so it stays as it is', 'a take with votes stays as it was voted on');
select lives_ok(
  $$select public.cast_round_vote('e4000000-0000-4000-8000-000000000002', 'take',
      'e1000000-0000-4000-8000-000000000002')$$, 'Gina votes Hal');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000002') #>> '{takes,closed}',
  'false', 'an after-reveal vote runs its full day: a take could still be coming');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.save_round_take('e4000000-0000-4000-8000-000000000002', 'I did not watch it')$$,
  'P0001', 'lock in your scores to write a take', 'writing one needs your own card');
reset role;
update public.reveal_sessions set revealed_at = now() - interval '25 hours'
 where id = 'e4000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select string_agg((e ->> 'votes') || ':' || (e ->> 'winner'), ',' order by e ->> 'author_id')
     from jsonb_array_elements(public.round_game_state('e4000000-0000-4000-8000-000000000002')
            #> '{takes,entries}') e),
  '1:true,1:true', 'a day later it closes: a 1-1 tie shares the win');

-- ======================= a late card starts the fight (Thief) =====================
update public.groups set takes_mode = 'off' where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001',
        '[{"key":"story","label":"Story","weight":30},{"key":"pacing","label":"Pacing","weight":20}]');
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000001', '{"story":8,"pacing":10}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002', '{"story":3,"pacing":2}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.reveal_session('e4000000-0000-4000-8000-000000000003');
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.late_score_session('e4000000-0000-4000-8000-000000000003', '{"story":6,"pacing":6}'::jsonb);
reset role;
select is(
  (select row(category_key, high_member_id, low_member_id)::text from public.round_fights
    where session_id = 'e4000000-0000-4000-8000-000000000003'),
  row('pacing', 'e1000000-0000-4000-8000-000000000001'::uuid, 'e1000000-0000-4000-8000-000000000002'::uuid)::text,
  'a third card after the reveal starts the fight the reveal could not');

-- Only Gina argues, and the day runs out.
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.save_fight_argument('e4000000-0000-4000-8000-000000000003', 'Ten. The vault scene alone.');
reset role;
update public.round_fights set created_at = now() - interval '25 hours'
 where session_id = 'e4000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select row(r ->> 'phase', r ->> 'outcome', r ->> 'winner_id')::text
     from (select public.round_game_state('e4000000-0000-4000-8000-000000000003') -> 'fight' as r) x),
  row('closed', 'forfeit', 'e1000000-0000-4000-8000-000000000001')::text,
  'Hal never argued: Gina takes it by forfeit');
select is(
  (select fight_wins from public.group_trophies('e2000000-0000-4000-8000-000000000001')
    where user_id = 'e1000000-0000-4000-8000-000000000001'),
  1, 'a forfeit is not a trophy: every win on the shelf was voted for');

-- ======================= fights switched off (Collateral) ==========================
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.groups set fights = false where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric)
values ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001',
        '[{"key":"pacing","label":"Pacing","weight":20}]');
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', '{"pacing":10}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000002', '{"pacing":1}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000003', '{"pacing":5}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.reveal_session('e4000000-0000-4000-8000-000000000004');
reset role;
select is(
  (select count(*)::int from public.round_fights where session_id = 'e4000000-0000-4000-8000-000000000004'),
  0, 'a group with fights off never starts one');

-- ======================= blocks ======================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.user_blocks (blocker_id, blocked_id)
values ('e1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002');
select is(
  public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,me}',
  'watcher', 'Ivy blocked a fighter: she can watch, not judge');
select ok(
  not exists (select 1 from jsonb_array_elements(
    public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{takes,entries}') e
    where e ->> 'author_id' = 'e1000000-0000-4000-8000-000000000002'),
  'and Hal''s take is gone from her view');

-- ======================= the posture ===================================================
select throws_ok($$select count(*) from public.round_posts$$, '42501', null,
  'no client reads a game table directly');
select throws_ok($$select count(*) from public.round_votes$$, '42501', null,
  'votes included');
select ok(
  not has_function_privilege('anon', 'public.round_game_state(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cast_round_vote(uuid, text, uuid)', 'execute'),
  'anon cannot read or vote');
select ok(
  not has_function_privilege('authenticated', 'public.start_round_fight(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fight_status(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.take_results(uuid)', 'execute'),
  'the internals are not an API');

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select string_agg(kind, ',' order by kind) from public.my_round_posts()),
  'argument,take,take', 'Hal''s export holds his takes and his argument');

select * from finish();
rollback;

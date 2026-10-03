-- Round games on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/round_games_test.sql.
--
-- Run after 20-grants.sql, so it also proves the game tables stay RPC-only,
-- and a round's row takes no client UPDATE, on a project whose defaults hand
-- every role everything.

\set ON_ERROR_STOP on

begin;

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
update public.profiles set accepted_terms_at = now();
update public.profiles set is_moderator = true where id = 'e1000000-0000-4000-8000-000000000005';

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('e3000000-0000-4000-8000-000000000001', 949, 'movie', 'Heat', 1995);
insert into public.groups (id, name, owner_id)
values ('e2000000-0000-4000-8000-000000000001', 'Popcorn Court', 'e1000000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'member'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'member'),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'member');

-- PASS 1: the game tables are RPC-only and a round's row takes no client UPDATE.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s:%s', r, t, p), ', ') into bad
    from unnest(array['anon', 'authenticated']) r
    cross join unnest(array['public.round_fights', 'public.round_posts',
                            'public.round_votes', 'public.round_post_reports']) t
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, t, p);
  if bad is not null then
    raise exception 'FAIL 1: privileges on the game tables: %', bad;
  end if;
  if has_table_privilege('authenticated', 'public.reveal_sessions', 'UPDATE') then
    raise exception 'FAIL 1: a client can UPDATE a round';
  end if;
  if has_function_privilege('anon', 'public.round_game_state(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.start_round_fight(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fight_status(uuid)', 'EXECUTE') then
    raise exception 'FAIL 1: a game function is exposed';
  end if;
  raise notice 'PASS 1: game tables are RPC-only; rounds take no client UPDATE; internals sealed';
end $$;

-- PASS 2: a client insert starts blind, now, in the group's takes mode.
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
update public.groups set takes_mode = 'blind' where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric, state, revealed_at, takes_mode)
values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
        '[{"key":"story","label":"Story","weight":30},{"key":"pacing","label":"Pacing","weight":20}]',
        'revealed', now() + interval '3 days', 'off');
reset role;
do $$
begin
  if (select row(state, revealed_at, takes_mode)::text from public.reveal_sessions
       where id = 'e4000000-0000-4000-8000-000000000001')
     is distinct from row('blind'::public.reveal_state, null::timestamptz, 'blind')::text then
    raise exception 'FAIL 2: a client insert chose its own state, clock or mode';
  end if;
  raise notice 'PASS 2: a client insert starts blind, unrevealed, in the group''s takes mode';
end $$;

-- PASS 3: THE ONE RULE while blind: only the author reads a take.
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
  perform public.save_round_take('e4000000-0000-4000-8000-000000000001', 'The silences are the point.');
end $$;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  perform public.save_round_take('e4000000-0000-4000-8000-000000000001', 'Two great scenes and a procedural.');
  if public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'takes' <> 'null'::jsonb then
    raise exception 'FAIL 3: a blind round showed takes';
  end if;
  if public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{my_take,body}'
     is distinct from 'Two great scenes and a procedural.' then
    raise exception 'FAIL 3: the author could not read her own take';
  end if;
  raise notice 'PASS 3: while blind, a take is its author''s alone';
end $$;

-- Cards: Pacing splits 9 / 3 / 6. Gina reveals.
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', '{"story":7,"pacing":9}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', '{"story":7,"pacing":3}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.member_scores (session_id, member_id, scores, locked) values
  ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', '{"story":8,"pacing":6}', true);
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  perform public.reveal_session('e4000000-0000-4000-8000-000000000001');
end $$;

-- PASS 4: the reveal starts the fight on the most split category.
reset role;
do $$
begin
  if (select row(category_key, high_member_id, low_member_id)::text from public.round_fights
       where session_id = 'e4000000-0000-4000-8000-000000000001')
     is distinct from row('pacing', 'e1000000-0000-4000-8000-000000000001'::uuid,
                          'e1000000-0000-4000-8000-000000000002'::uuid)::text then
    raise exception 'FAIL 4: the fight is not Gina vs Hal on Pacing';
  end if;
  raise notice 'PASS 4: the reveal starts Gina vs Hal on Pacing';
end $$;

-- PASS 5: THE ONE RULE after the reveal: no card, no fight, no takes.
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
do $$
declare r jsonb := public.round_game_state('e4000000-0000-4000-8000-000000000001');
begin
  if r -> 'fight' <> 'null'::jsonb or r -> 'takes' <> 'null'::jsonb
     or not (r ->> 'sealed')::boolean then
    raise exception 'FAIL 5: a member with no card saw the games: %', r;
  end if;
  raise notice 'PASS 5: a member with no card sees no fight and no takes';
end $$;

-- PASS 6: arguments are sealed until both are in; then judging opens.
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  perform public.save_fight_argument('e4000000-0000-4000-8000-000000000001', 'The waiting IS the heist.');
end $$;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
  if public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{fight,high,argument}' <> 'null'::jsonb then
    raise exception 'FAIL 6: Hal read Gina''s argument before making his';
  end if;
  perform public.save_fight_argument('e4000000-0000-4000-8000-000000000001', 'The middle hour sags.');
end $$;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  if public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{fight,phase}' <> 'judging' then
    raise exception 'FAIL 6: judging did not open';
  end if;
  raise notice 'PASS 6: arguments stay sealed until both are in';
end $$;

-- PASS 7: Ivy, the only judge, votes: sealed until then, final at once.
do $$
declare r jsonb;
begin
  perform public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'fight',
    'e1000000-0000-4000-8000-000000000002');
  r := public.round_game_state('e4000000-0000-4000-8000-000000000001') -> 'fight';
  if r ->> 'phase' <> 'closed' or r ->> 'outcome' <> 'win'
     or r ->> 'winner_id' <> 'e1000000-0000-4000-8000-000000000002' then
    raise exception 'FAIL 7: the fight did not close for Hal: %', r;
  end if;
  raise notice 'PASS 7: every judge voted, so the bell rang: Hal wins';
end $$;

-- PASS 8: the blind best-take vote closes once every player voted.
do $$
begin
  perform public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
    'e1000000-0000-4000-8000-000000000002');
  if exists (select 1 from jsonb_array_elements(
       public.round_game_state('e4000000-0000-4000-8000-000000000001') #> '{takes,entries}') e
       where e -> 'votes' <> 'null'::jsonb) then
    raise exception 'FAIL 8: a tally showed while the vote was open';
  end if;
end $$;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  perform public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
    'e1000000-0000-4000-8000-000000000003');
end $$;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
declare v_shelf text;
begin
  perform public.cast_round_vote('e4000000-0000-4000-8000-000000000001', 'take',
    'e1000000-0000-4000-8000-000000000003');
  if public.round_game_state('e4000000-0000-4000-8000-000000000001') #>> '{takes,closed}' <> 'true' then
    raise exception 'FAIL 8: the vote did not close when everyone had voted';
  end if;
  select string_agg(user_id::text || ':' || take_wins || ':' || fight_wins, ',' order by user_id)
    into v_shelf
    from public.group_trophies('e2000000-0000-4000-8000-000000000001')
   where take_wins + fight_wins > 0;
  if v_shelf is distinct from
     'e1000000-0000-4000-8000-000000000002:0:1,e1000000-0000-4000-8000-000000000003:1:0' then
    raise exception 'FAIL 8: the shelf reads %', v_shelf;
  end if;
  raise notice 'PASS 8: the take vote closes once all voted; the shelf counts both wins';
end $$;

-- PASS 9: three reports hide a take; the moderator's dismissal restores it.
do $$
declare v_post uuid;
begin
  select (e ->> 'post_id')::uuid into v_post
    from jsonb_array_elements(public.round_game_state('e4000000-0000-4000-8000-000000000001')
           #> '{takes,entries}') e
   where e ->> 'author_id' = 'e1000000-0000-4000-8000-000000000003';
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  perform public.report_round_post(v_post, null);
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform public.report_round_post(v_post, 'mean');
  -- a third reporter
  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
  begin
    perform public.report_round_post(v_post, null);
    raise exception 'FAIL 9: Jon (no card) reported a take he cannot see';
  exception when raise_exception then
    if sqlerrm <> 'that post is not available' then raise; end if;
  end;
  perform public.late_score_session('e4000000-0000-4000-8000-000000000001', '{"story":6,"pacing":5}'::jsonb);
  perform public.report_round_post(v_post, null);

  perform set_config('request.jwt.claims',
    '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
  if not exists (select 1 from public.moderation_queue()
                  where content_id = v_post and kind = 'take' and already_hidden) then
    raise exception 'FAIL 9: the hidden take is not in the moderation queue';
  end if;
  perform public.resolve_report('take', v_post, 'dismiss', null);
  if exists (select 1 from public.moderation_queue() where content_id = v_post) then
    raise exception 'FAIL 9: dismissing left the take in the queue';
  end if;
  raise notice 'PASS 9: reports hide a take, queue it, and a dismissal restores it';
end $$;

reset role;
rollback;

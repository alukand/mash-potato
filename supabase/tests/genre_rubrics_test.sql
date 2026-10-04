-- Genre rubrics: yours to write, your groupmates' to read (a round blends
-- them), nobody else's. Plus the two "which genre leads" rules, and the
-- genre and rubric a round and a solo rating are given with.
-- Run with: npx supabase test db
--
-- Cast: Ana owns "Genre Night" with Ben in it; Cara is a stranger.

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'ana@genres.test', 'Ana'),
    ('d1000000-0000-4000-8000-000000000002'::uuid, 'ben@genres.test', 'Ben'),
    ('d1000000-0000-4000-8000-000000000003'::uuid, 'cara@genres.test', 'Cara')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now();

insert into public.groups (id, name, owner_id)
values ('d2000000-0000-4000-8000-000000000001', 'Genre Night', 'd1000000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, user_id, role)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'member');
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('d3000000-0000-4000-8000-000000000001', null, 'movie', 'The Thing', 1982);

-- ======================= your genre rubrics ========================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows) values
    ('d1000000-0000-4000-8000-000000000001', 'horror',
     '[{"key":"fearFactor","label":"Fear Factor","weight":50,"enabled":true,"sort":0},
       {"key":"story","label":"Story","weight":20,"enabled":true,"sort":1}]')$$,
  'Ana saves her own Horror rubric');
select lives_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000001', 'comedy', null)$$,
  'and chooses the standard for Comedy (rows null: decided, not custom)');
select throws_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000002', 'horror', null)$$,
  '42501', null, 'she cannot write Ben''s');
select throws_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000001', 'telenovela', null)$$,
  '23514', null, 'only the app''s genres');
select throws_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000001', 'drama', '{"story":20}')$$,
  '23514', null, 'a rubric is a list of rows');
select throws_ok(
  $$insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000001', 'drama', '[]')$$,
  '23514', null, 'and never an empty one');

set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.genre_rubrics where user_id = 'd1000000-0000-4000-8000-000000000001'),
  2, 'Ben, a groupmate, reads both of Ana''s choices (rounds blend them)');
update public.genre_rubrics set rows = null
 where user_id = 'd1000000-0000-4000-8000-000000000001' and genre = 'horror';
select ok(
  (select rows is not null from public.genre_rubrics
    where user_id = 'd1000000-0000-4000-8000-000000000001' and genre = 'horror'),
  'but cannot change them');

set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.genre_rubrics where user_id = 'd1000000-0000-4000-8000-000000000001'),
  0, 'Cara, a stranger, reads nothing');
reset role;
select ok(
  not has_table_privilege('anon', 'public.genre_rubrics', 'select')
  and not has_table_privilege('anon', 'public.genre_rubrics', 'insert'),
  'signed out, genre rubrics do not exist');

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$delete from public.genre_rubrics
     where user_id = 'd1000000-0000-4000-8000-000000000001' and genre = 'comedy'$$,
  'Ana can take a choice back (and be asked again)');
select is(
  (select count(*)::int from public.genre_rubrics where user_id = 'd1000000-0000-4000-8000-000000000001'),
  1, 'leaving just her Horror rubric');

-- ======================= which genre leads ========================================
select is((select genre_rule from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'),
  'first', 'everyone starts on the first genre TMDB lists');
select lives_ok(
  $$update public.profiles set genre_rule = 'order' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'Ana switches her own solo rule to the app''s order');
update public.profiles set genre_rule = 'order' where id = 'd1000000-0000-4000-8000-000000000002';
select throws_ok(
  $$update public.profiles set genre_rule = 'random' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'first or order, nothing else');
select lives_ok(
  $$update public.groups set genre_rule = 'order' where id = 'd2000000-0000-4000-8000-000000000001'$$,
  'the owner sets the group''s rule');
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
update public.groups set genre_rule = 'first' where id = 'd2000000-0000-4000-8000-000000000001';
reset role;
select is(
  (select row(
     (select genre_rule from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'),
     (select genre_rule from public.profiles where id = 'd1000000-0000-4000-8000-000000000002'),
     (select genre_rule from public.groups where id = 'd2000000-0000-4000-8000-000000000001'))::text),
  row('order', 'first', 'order')::text,
  'Ana''s change stuck; she could not change Ben''s, nor Ben the group''s');

-- ======================= rounds and ratings carry their genre ======================
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.reveal_sessions (id, group_id, title_id, created_by, rubric, genre)
values ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
        'd3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
        '[{"key":"fearFactor","label":"Fear Factor","weight":42.5}]', 'horror');
reset role;
select is((select genre from public.reveal_sessions where id = 'd4000000-0000-4000-8000-000000000001'),
  'horror', 'a round keeps the genre it was started as');
set local role authenticated;
select throws_ok(
  $$insert into public.reveal_sessions (group_id, title_id, created_by, rubric, genre)
    values ('d2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
            'd1000000-0000-4000-8000-000000000001', '[]', 'giallo')$$,
  '23514', null, 'and only one of the app''s genres');

select lives_ok(
  $$insert into public.global_ratings (user_id, title_id, scores, genre, rubric)
    values ('d1000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
            '{"fearFactor":9,"story":6}', 'horror',
            '[{"key":"fearFactor","label":"Fear Factor","weight":50},{"key":"story","label":"Story","weight":20}]')$$,
  'a solo rating keeps the genre and rubric it was given with');
select throws_ok(
  $$update public.global_ratings set rubric = '{"story":20}'
     where user_id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the snapshot is a list of entries');
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.global_ratings where user_id = 'd1000000-0000-4000-8000-000000000001'),
  0, 'solo ratings stay self-only');

-- ======================= the feed carries the rubric ===============================
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.set_share_ratings(true);
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.follow_user('d1000000-0000-4000-8000-000000000001');
select is(
  (select rubric -> 0 ->> 'key' from public.following_feed(10, null)),
  'fearFactor', 'a follower gets the rating with its own rubric, to score it on the rater''s card');
select is(
  (select rubric -> 0 ->> 'weight' from public.following_feed(10, null)),
  '50', 'weights included');
reset role;
select ok(
  not has_function_privilege('anon', 'public.following_feed(integer, uuid)', 'execute'),
  'the feed is still signed-in only');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'genre_rule', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'banned', 'update'),
  'genre_rule joins the self-editable profile columns, and nothing else does');

select * from finish();
rollback;

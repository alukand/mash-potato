-- Follows and the shared-ratings feed on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/follows_test.sql.
--
-- Run after 20-grants.sql: on a project whose defaults hand every role
-- everything, the follows table and profiles.share_ratings must still be
-- out of reach, and a blind card must still never reach a feed.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());
insert into public.titles (id, tmdb_id, media_type, name, year) values
  ('f5000000-0000-4000-8000-000000000001', 770001, 'movie', 'Shared Film', 2024),
  ('f5000000-0000-4000-8000-000000000002', 770002, 'movie', 'Blind Film', 2024);
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f5000000-0000-4000-8000-000000000001', '{"enjoyment": 9}');

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('f5000000-0000-4000-8000-0000000000a1', 'Ben Crew', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('f5000000-0000-4000-8000-0000000000b1', 'f5000000-0000-4000-8000-0000000000a1',
        'f5000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.member_scores (session_id, member_id, scores, locked)
values ('f5000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"enjoyment": 3}', true);

-- PASS 1: the table and the setting are out of reach.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s', r, p), ', ') into bad
    from unnest(array['anon', 'authenticated']) r
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, 'public.follows', p);
  if bad is not null then raise exception 'FAIL 1: privileges on follows: %', bad; end if;
  if has_column_privilege('authenticated', 'public.profiles', 'share_ratings', 'SELECT') then
    raise exception 'FAIL 1: authenticated reads share_ratings off profiles';
  end if;
  raise notice 'PASS 1: follows is RPC-only and share_ratings is not a readable column';
end $$;

-- PASS 2: nothing shared until Ben opts in, then only his solo rating.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  perform public.follow_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  if exists (select 1 from public.following_feed(30)) then
    raise exception 'FAIL 2: the feed showed Ben before he chose to share';
  end if;
end $$;
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$ begin perform public.set_share_ratings(true); end $$;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  if (select array_agg(title_name) from public.following_feed(30)) is distinct from array['Shared Film'] then
    raise exception 'FAIL 2: the feed is not exactly Ben''s solo rating';
  end if;
  raise notice 'PASS 2: sharing is opt-in, and only solo ratings travel (no blind card)';
end $$;
reset role;

rollback;

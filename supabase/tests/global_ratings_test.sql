-- global_ratings is SELF-ONLY for direct reads, but title_community_score
-- (SECURITY DEFINER) aggregates across every user and returns only the count +
-- weighted mean. Run with: npx supabase test db.

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ---- Ana rates it ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', '{"story":8}');

select is(
  (select count(*)::int from public.global_ratings), 1,
  'Ana sees her own global rating');

-- ---- Ben rates it ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', '{"story":6}');

select is(
  (select count(*)::int from public.global_ratings), 1,
  'Ben sees only his own global rating, not Ana''s');

-- Ben cannot rate on Ana's behalf.
select throws_ok(
  $$insert into public.global_ratings (user_id, title_id, scores)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '77777777-7777-7777-7777-777777777777', '{"story":1}')$$,
  '42501', NULL,
  'Ben cannot write a rating for Ana');

-- The community aggregate spans both (weighted mean of 8 & 6 = 7).
select results_eq(
  $$select rating_count, round(mashed, 2)
      from public.title_community_score('77777777-7777-7777-7777-777777777777', '{"story":1}'::jsonb)$$,
  $$values (2, 7.00::numeric)$$,
  'community aggregate spans all users without exposing rows');

select * from finish();
rollback;

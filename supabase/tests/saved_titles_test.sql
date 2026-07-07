-- Proves saved_titles is SELF-ONLY: a member reads, adds, and removes only
-- their own saved titles — never anyone else's. Independent of the blind rule;
-- run alongside it with: npx supabase test db   (needs the local stack up).

create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

-- ---- seed as the test superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());
-- (the on_auth_user_created trigger created their profiles)

-- A shared title (titles are a global cache).
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ---- act as Ana ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.saved_titles (user_id, title_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777');

select is(
  (select count(*)::int from public.saved_titles),
  1, 'Ana sees her own saved title');

-- ---- act as Ben ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  (select count(*)::int from public.saved_titles),
  0, 'Ben cannot see Ana''s saved titles');

-- Ben cannot save on Ana's behalf (insert with check user_id = auth.uid()).
-- NULL errmsg: assert the SQLSTATE only, so the test is robust to wording drift.
select throws_ok(
  $$insert into public.saved_titles (user_id, title_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '77777777-7777-7777-7777-777777777777')$$,
  '42501', NULL,
  'Ben cannot save a title for Ana');

-- Ben saves the SAME title for himself — the PK is per-user, so this is fine.
insert into public.saved_titles (user_id, title_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777');

select is(
  (select count(*)::int from public.saved_titles),
  1, 'Ben sees his own save, and only his');

-- ---- back to Ana: unsave ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

delete from public.saved_titles
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and title_id = '77777777-7777-7777-7777-777777777777';

select is(
  (select count(*)::int from public.saved_titles),
  0, 'Ana can remove her own save');

select * from finish();
rollback;

-- saved_titles is SELF-ONLY: a member reads, adds, and removes only their own
-- saved titles. Plain-SQL port of supabase/tests/saved_titles_test.sql (pgTAP)
-- so it runs on vanilla PostgreSQL — same seed, same assertions. Each check
-- raises an exception on failure (psql exits non-zero via ON_ERROR_STOP); on
-- success it prints a PASS notice.
--
-- Cast: Ana and Ben — two authenticated users with no group between them.

\set ON_ERROR_STOP on

begin;

-- ---- seed as superuser (RLS bypassed) ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());
-- (the on_auth_user_created trigger created their profiles)

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

-- ---- act as Ana ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.saved_titles (user_id, title_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777');

do $$
declare c int;
begin
  select count(*) into c from public.saved_titles;
  if c <> 1 then raise exception 'FAIL 1: Ana cannot read her OWN saved title (rows=%)', c; end if;
  raise notice 'PASS 1: Ana sees her own saved title';
end $$;

-- ---- act as Ben ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.saved_titles;
  if c <> 0 then raise exception 'FAIL 2: Ben CAN see Ana''s saved titles — self-only is broken (rows=%)', c; end if;
  raise notice 'PASS 2: Ben cannot see Ana''s saved titles';
end $$;

-- Ben must not be able to save a title on Ana's behalf.
do $$
begin
  begin
    insert into public.saved_titles (user_id, title_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '77777777-7777-7777-7777-777777777777');
    raise exception 'FAIL 3: Ben saved a title for Ana — insert policy is broken';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3: Ben cannot save a title for Ana';
  end;
end $$;

-- Ben saves the SAME title for himself — the PK is per-user, so this is fine.
insert into public.saved_titles (user_id, title_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777');

do $$
declare c int;
begin
  select count(*) into c from public.saved_titles;
  if c <> 1 then raise exception 'FAIL 4: Ben should see exactly his own save (rows=%)', c; end if;
  raise notice 'PASS 4: Ben sees his own save, and only his';
end $$;

-- ---- back to Ana: unsave ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

delete from public.saved_titles
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and title_id = '77777777-7777-7777-7777-777777777777';

do $$
declare c int;
begin
  select count(*) into c from public.saved_titles;
  if c <> 0 then raise exception 'FAIL 5: Ana could not remove her own save (rows=%)', c; end if;
  raise notice 'PASS 5: Ana can remove her own save';
end $$;

do $$ begin raise notice '=== ALL 5 SAVED-TITLES ASSERTIONS PASSED — the list is self-only ==='; end $$;

rollback;

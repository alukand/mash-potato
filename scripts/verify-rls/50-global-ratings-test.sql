-- global_ratings is SELF-ONLY for direct reads, yet the community aggregate
-- (title_community_score, SECURITY DEFINER) sees EVERY user's rating and
-- returns only the count + weighted mean — never a single member's row. Plain
-- SQL so it runs on vanilla Postgres. Cast: Ana and Ben.

\set ON_ERROR_STOP on

begin;

-- ---- seed as superuser (RLS bypassed) ----
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
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777',
        '{"story":8}');

do $$
declare c int;
begin
  select count(*) into c from public.global_ratings;
  if c <> 1 then raise exception 'FAIL 1: Ana cannot read her OWN global rating (rows=%)', c; end if;
  raise notice 'PASS 1: Ana sees her own global rating';
end $$;

-- ---- Ben rates the same title ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777',
        '{"story":6}');

do $$
declare c int;
begin
  select count(*) into c from public.global_ratings;
  if c <> 1 then raise exception 'FAIL 2: Ben sees % rows (self-only broken)', c; end if;
  raise notice 'PASS 2: Ben sees only his own global rating, not Ana''s';
end $$;

-- Ben cannot write a rating on Ana's behalf.
do $$
begin
  begin
    insert into public.global_ratings (user_id, title_id, scores)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '77777777-7777-7777-7777-777777777777', '{"story":1}');
    raise exception 'FAIL 3: Ben wrote a rating for Ana — insert policy broken';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3: Ben cannot rate on Ana''s behalf';
  end;
end $$;

-- The community aggregate sees BOTH ratings (count=2, weighted mean of 8 & 6 = 7)
-- even though Ben's direct select above returned only his own row.
do $$
declare rc int; ms numeric;
begin
  select rating_count, mashed into rc, ms
    from public.title_community_score('77777777-7777-7777-7777-777777777777', '{"story":1}'::jsonb);
  if rc <> 2 then raise exception 'FAIL 4: community count=% (want 2)', rc; end if;
  if round(ms, 2) <> 7.00 then raise exception 'FAIL 4b: community mean=% (want 7.00)', ms; end if;
  raise notice 'PASS 4: community aggregate spans all users (count=2, mean=7) without exposing rows';
end $$;

do $$ begin raise notice '=== ALL 4 GLOBAL-RATINGS ASSERTIONS PASSED ==='; end $$;

rollback;

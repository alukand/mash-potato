-- Genre rubrics on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/genre_rubrics_test.sql.
--
-- Run after 20-grants.sql, so it also proves anon holds nothing on
-- genre_rubrics on a project whose defaults hand every role everything.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('d1000000-0000-4000-8000-000000000001'::uuid, 'ana@genres.test', 'Ana'),
    ('d1000000-0000-4000-8000-000000000002'::uuid, 'ben@genres.test', 'Ben'),
    ('d1000000-0000-4000-8000-000000000003'::uuid, 'cara@genres.test', 'Cara')
  ) as u(id, email, name);
insert into public.groups (id, name, owner_id)
values ('d2000000-0000-4000-8000-000000000001', 'Genre Night', 'd1000000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, user_id, role)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'member');

-- PASS 1: anon holds nothing; signed in, the table is reachable (RLS decides rows).
do $$
declare bad text;
begin
  select string_agg(p, ', ') into bad
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege('anon', 'public.genre_rubrics', p);
  if bad is not null then
    raise exception 'FAIL 1: anon holds % on genre_rubrics', bad;
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'genre_rule', 'UPDATE') then
    raise exception 'FAIL 1: genre_rule is not self-editable';
  end if;
  raise notice 'PASS 1: anon holds nothing on genre rubrics; genre_rule is a self-editable column';
end $$;

-- PASS 2: you write only your own.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.genre_rubrics (user_id, genre, rows) values
  ('d1000000-0000-4000-8000-000000000001', 'horror',
   '[{"key":"fearFactor","label":"Fear Factor","weight":50,"enabled":true,"sort":0}]'),
  ('d1000000-0000-4000-8000-000000000001', 'comedy', null);
do $$
begin
  begin
    insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000002', 'horror', null);
    raise exception 'FAIL 2: Ana wrote Ben''s genre rubric';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.genre_rubrics (user_id, genre, rows)
    values ('d1000000-0000-4000-8000-000000000001', 'drama', '[]');
    raise exception 'FAIL 2: an empty rubric was stored';
  exception when check_violation then null;
  end;
  raise notice 'PASS 2: you write only your own genre rubrics, and only real ones';
end $$;

-- PASS 3: groupmates read them (rounds blend them); strangers do not.
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.genre_rubrics
       where user_id = 'd1000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FAIL 3: a groupmate cannot read Ana''s genre rubrics';
  end if;
  update public.genre_rubrics set rows = null
   where user_id = 'd1000000-0000-4000-8000-000000000001' and genre = 'horror';
  if found then raise exception 'FAIL 3: a groupmate changed Ana''s genre rubric'; end if;
end $$;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.genre_rubrics
              where user_id = 'd1000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL 3: a stranger read Ana''s genre rubrics';
  end if;
  raise notice 'PASS 3: groupmates read your genre rubrics, strangers do not, nobody else edits them';
end $$;

-- PASS 4: the feed hands a follower the rating's own rubric.
-- titles take no client writes, so the fixture goes in as the owner
reset role;
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('d3000000-0000-4000-8000-000000000001', null, 'movie', 'The Thing', 1982);
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.global_ratings (user_id, title_id, scores, genre, rubric)
values ('d1000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
        '{"fearFactor":9}', 'horror', '[{"key":"fearFactor","label":"Fear Factor","weight":50}]');
do $$
begin
  perform public.set_share_ratings(true);
end $$;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
  perform public.follow_user('d1000000-0000-4000-8000-000000000001');
  if (select rubric -> 0 ->> 'key' from public.following_feed(10, null)) is distinct from 'fearFactor' then
    raise exception 'FAIL 4: the feed lost the rating''s rubric';
  end if;
  raise notice 'PASS 4: a follower gets the rating with the rubric it was given with';
end $$;

reset role;
rollback;

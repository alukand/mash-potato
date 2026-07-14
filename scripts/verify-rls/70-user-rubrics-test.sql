-- user_rubrics (personal presets): self-only in every direction, one favorite
-- max, and the favorite is what gets submitted when joining/creating a group.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now());

-- ---- Ana saves a favorite preset (story-heavy + humor) ----
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.user_rubrics (user_id, name, rows, is_favorite)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Comedy night',
        '[{"key":"story","label":"Story","weight":40,"enabled":true,"sort":0},
          {"key":"humor","label":"Humor","weight":30,"enabled":true,"sort":1}]', true);

do $$
declare c int;
begin
  select count(*) into c from public.user_rubrics;
  if c <> 1 then raise exception 'FAIL 1: Ana cannot read her own preset (rows=%)', c; end if;
  raise notice 'PASS 1: Ana sees her own preset';
end $$;

-- ---- Ben sees nothing and cannot write for Ana ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.user_rubrics;
  if c <> 0 then raise exception 'FAIL 2: Ben sees Ana''s presets (rows=%)', c; end if;
  raise notice 'PASS 2: presets are self-only';
end $$;

do $$
begin
  begin
    insert into public.user_rubrics (user_id, name, rows)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sneaky', '[]');
    raise exception 'FAIL 3: Ben wrote a preset for Ana';
  exception
    when insufficient_privilege then
      raise notice 'PASS 3: Ben cannot write presets for Ana';
  end;
end $$;

-- ---- only one favorite per user ----
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
begin
  begin
    insert into public.user_rubrics (user_id, name, rows, is_favorite)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Second fav', '[]', true);
    raise exception 'FAIL 4: two favorites were allowed';
  exception
    when unique_violation then
      raise notice 'PASS 4: at most one favorite per user';
  end;
end $$;

-- ---- creating a group submits the favorite as Ana's member rubric ----
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

do $$
declare c int; humor_w int; ei_w int;
begin
  -- The preset's 2 rows land at their own weights, and the 6 base categories
  -- the preset lacks join at defaults (base coverage: 2 + 6 = 8 rows).
  select count(*) into c from public.member_rubrics
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select weight into humor_w from public.member_rubrics
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category_key = 'humor';
  select weight into ei_w from public.member_rubrics
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and category_key = 'emotionalImpact';
  if c <> 8 or humor_w <> 30 or ei_w <> 25 then
    raise exception 'FAIL 5: favorite not seeded with base coverage (rows=%, humor=%, emotionalImpact=%)', c, humor_w, ei_w;
  end if;
  raise notice 'PASS 5: joining a group submits the favorite rubric plus base coverage (8 rows)';
end $$;

do $$ begin raise notice '=== ALL 5 USER-RUBRICS ASSERTIONS PASSED ==='; end $$;

rollback;

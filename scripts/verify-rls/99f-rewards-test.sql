-- Tokens on vanilla Postgres. Plain-SQL twin of supabase/tests/rewards_test.sql.
--
-- The twin starts from an empty database every run, so it is where "the flag
-- SHIPS off" is proven. It also re-proves, after the platform's blanket grants
-- (20-grants.sql), that no client role can reach a token table or an award
-- internal, and walks one take through earn -> hold -> hide -> clawback.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, jsonb_build_object('display_name', u.name), now(), now()
  from (values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'ana@test.dev', 'Ana'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'ben@test.dev', 'Ben'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'cara@test.dev', 'Cara'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'dan@test.dev', 'Dan')
  ) as u(id, email, name);
update public.profiles set accepted_terms_at = now();
insert into public.titles (id, tmdb_id, media_type, name, year)
values ('f1000000-0000-4000-8000-000000000001', 880001, 'movie', 'Film 1', 2020);

-- PASS 1: ships off; sealed from clients even after blanket grants.
do $$
declare bad text;
begin
  if (select enabled from public.feature_flags where key = 'rewards') is distinct from false then
    raise exception 'FAIL 1: rewards does not ship off';
  end if;
  if (select started_at from public.token_program) is not null then
    raise exception 'FAIL 1: the program has a start before launch';
  end if;
  select string_agg(format('%s:%s:%s', t, r, p), ', ') into bad
    from unnest(array['token_rules', 'token_program', 'token_accounts',
                      'token_ledger', 'token_ineligible']) t
    cross join unnest(array['anon', 'authenticated']) r
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, 'public.' || t, p);
  if bad is not null then
    raise exception 'FAIL 1: client privileges on token tables: %', bad;
  end if;
  if has_function_privilege('authenticated',
       'public.award_tokens(uuid, text, integer, uuid, uuid, uuid, text, timestamptz, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_take(uuid)', 'EXECUTE') then
    raise exception 'FAIL 1: a signed-in user can call an award internal';
  end if;
  if has_function_privilege('anon', 'public.my_rewards(integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_daily_tokens(text)', 'EXECUTE') then
    raise exception 'FAIL 1: anon can call a token RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.claim_daily_tokens(text)', 'EXECUTE') then
    raise exception 'FAIL 1: a signed-in user cannot claim';
  end if;
  raise notice 'PASS 1: rewards ships off, and token tables and internals are sealed from clients';
end $$;

-- Launch.
update public.feature_flags set enabled = true where key = 'rewards';

-- PASS 2: as a real client: the daily token pays once; the ledger itself is
-- unreadable.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  if not (public.claim_daily_tokens('America/Chicago') ->> 'claimed')::boolean then
    raise exception 'FAIL 2: the first daily claim did not pay';
  end if;
  if (public.claim_daily_tokens('America/Chicago') ->> 'claimed')::boolean then
    raise exception 'FAIL 2: a second daily claim paid';
  end if;
  begin
    perform 1 from public.token_ledger;
    raise exception 'FAIL 2: a client read the ledger directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 2: the daily token pays once a day, and the ledger is not readable';
end $$;

-- The client writes its own solo rating, then a long, real public take.
insert into public.global_ratings (user_id, title_id, scores)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1000000-0000-4000-8000-000000000001', '{"story": 7}');
do $$
begin
  perform public.post_comment('f1000000-0000-4000-8000-000000000001', null, null,
    'The first hour moves like a slow tide, patient and confident, letting every frame '
    'breathe before the story tightens its grip. The lead performance carries real '
    'weight, especially in the quiet scenes where nothing is said and everything is '
    'felt. The score swells at exactly the right moments, and the final act lands with '
    'a punch I did not see coming at all.');
end $$;

-- PASS 3: daily 1 + solo 1 + take 3 are spendable; the long-take bonus waits.
do $$
begin
  if (public.my_rewards() ->> 'balance')::int <> 5 then
    raise exception 'FAIL 3: balance is %, expected 5', public.my_rewards() ->> 'balance';
  end if;
  if (public.my_rewards() ->> 'pending')::int <> 2 then
    raise exception 'FAIL 3: pending is %, expected 2', public.my_rewards() ->> 'pending';
  end if;
  raise notice 'PASS 3: 5 tokens spendable, the +2 long-take bonus pending its 48 hours';
end $$;
reset role;

-- PASS 4: three reports hide the take inside its hold: the bonus is voided
-- and the base clawed back.
insert into public.comment_reports (comment_id, reporter_id)
select c.id, r
  from public.title_comments c
 cross join unnest(array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                         'dddddddd-dddd-dddd-dddd-dddddddddddd']::uuid[]) as r
 where c.author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$
declare
  v_net  integer;
  v_void integer;
begin
  select sum(amount) filter (where l.status <> 'void'), count(*) filter (where l.status = 'void')
    into v_net, v_void
    from public.token_ledger l
    join public.title_comments c on c.id = l.comment_id
   where c.author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_net <> 0 or v_void <> 1 then
    raise exception 'FAIL 4: hidden take still worth % (voided bonuses: %)', v_net, v_void;
  end if;
  raise notice 'PASS 4: a take hidden by reports is clawed back and its pending bonus voided';
end $$;

-- PASS 5: the kill switch: off, nothing earns.
update public.feature_flags set enabled = false where key = 'rewards';
insert into public.global_ratings (user_id, title_id, scores)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f1000000-0000-4000-8000-000000000001', '{"story": 4}');
do $$
begin
  if exists (select 1 from public.token_ledger
              where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'FAIL 5: something earned with the flag off';
  end if;
  raise notice 'PASS 5: with the flag off, nothing earns';
end $$;

rollback;

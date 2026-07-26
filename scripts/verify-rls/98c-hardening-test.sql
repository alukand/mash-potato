-- Launch hardening on vanilla Postgres: the write surfaces that were open,
-- and the ceiling that was missing. Plain-SQL twin of
-- supabase/tests/hardening_test.sql.
--
-- Everything asserted here was OPEN on the hosted project on 2026-07-27, so
-- each check is a regression test rather than a hypothetical.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now());

-- PASS 1: titles takes no direct writes from a client
do $$
declare bad text;
begin
  select string_agg(p, ', ') into bad
  from unnest(array['INSERT','UPDATE','DELETE']) p
  where has_table_privilege('authenticated', 'public.titles', p);
  if bad is not null then
    raise exception 'FAIL 1: authenticated can % on titles', bad;
  end if;
  if has_table_privilege('anon', 'public.titles', 'INSERT') then
    raise exception 'FAIL 1: anon can INSERT into titles';
  end if;
  raise notice 'PASS 1: titles accepts no direct client writes';
end $$;

-- PASS 2: ...but stays readable, because a title is shared reference data
do $$
begin
  if not has_table_privilege('authenticated', 'public.titles', 'SELECT') then
    raise exception 'FAIL 2: titles is no longer readable';
  end if;
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='titles' and cmd='INSERT') then
    raise exception 'FAIL 2: an INSERT policy is still on titles';
  end if;
  raise notice 'PASS 2: titles stays readable and has no INSERT policy';
end $$;

-- PASS 3: profiles no longer leaks moderation state.
-- The ORDER matters: a column revoke does nothing while a table-level SELECT
-- grant stands, so this asserts the table grant is gone AND the columns the
-- app needs were re-granted.
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'FAIL 3: the table-level select grant on profiles is still there';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'banned', 'SELECT') then
    raise exception 'FAIL 3: authenticated can read profiles.banned';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'created_at', 'SELECT') then
    raise exception 'FAIL 3: authenticated can read profiles.created_at';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT') then
    raise exception 'FAIL 3: display_name is unreadable (five embeds depend on it)';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'avatar_key', 'SELECT') then
    raise exception 'FAIL 3: avatar_key is unreadable';
  end if;
  raise notice 'PASS 3: profiles exposes name and avatar, not banned or created_at';
end $$;

-- PASS 4: the rate-limit ledger is definer-only
do $$
declare bad text;
begin
  select string_agg(r, ', ') into bad
  from unnest(array['anon','authenticated']) r
  where has_table_privilege(r, 'public.rate_limits', 'SELECT');
  if bad is not null then
    raise exception 'FAIL 4: % can read rate_limits', bad;
  end if;
  raise notice 'PASS 4: rate_limits is sealed from every client role';
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- PASS 5: the limiter limits, and buckets are independent
do $$
begin
  perform public.consume_rate_limit('t_probe', 2, 60);
  perform public.consume_rate_limit('t_probe', 2, 60);
  begin
    perform public.consume_rate_limit('t_probe', 2, 60);
    raise exception 'FAIL 5: the call past the limit was allowed';
  exception when raise_exception then
    if sqlerrm <> 'you are doing that too fast, give it a moment' then raise; end if;
  end;
  -- a different bucket has its own budget
  perform public.consume_rate_limit('t_other', 2, 60);
  raise notice 'PASS 5: consume_rate_limit trips at the limit, per bucket';
end $$;

-- PASS 6: ensure_title refuses what it should
do $$
begin
  begin
    perform public.ensure_title(null, 'movie', 'Sneaky', 2020, 'https://evil.example/x.jpg');
    raise exception 'FAIL 6: a URL was accepted as a poster path';
  exception when raise_exception then
    if sqlerrm <> 'that poster path is not usable' then raise; end if;
  end;
  begin
    perform public.ensure_title(null, 'movie', E'Line one\nLine two', 2020, null);
    raise exception 'FAIL 6: a control character was accepted in a name';
  exception when raise_exception then
    if sqlerrm <> 'that title name is not usable' then raise; end if;
  end;
  begin
    perform public.ensure_title(null, 'book', 'Not A Film', 2020, null);
    raise exception 'FAIL 6: an unknown media type was accepted';
  exception when raise_exception then
    if sqlerrm <> 'a title is a film or a show' then raise; end if;
  end;
  raise notice 'PASS 6: ensure_title validates poster path, name and media type';
end $$;

-- PASS 7: ensure_title is idempotent, so racing callers share a row
do $$
declare a uuid; b uuid;
begin
  a := public.ensure_title(603, 'movie', 'The Matrix', 1999, null);
  b := public.ensure_title(603, 'movie', 'The Matrix (dupe attempt)', 1999, null);
  if a is distinct from b then
    raise exception 'FAIL 7: the same TMDB id produced two rows';
  end if;
  raise notice 'PASS 7: ensure_title is idempotent on (tmdb_id, media_type)';
end $$;

reset role;

-- PASS 8: the rate-limit trigger internals are sealed from clients
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array['rate_limit_message','rate_limit_comment','rate_limit_dm'])
    and (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute'));
  if bad is not null then
    raise exception 'FAIL 8: a client role can execute trigger internals: %', bad;
  end if;
  raise notice 'PASS 8: rate-limit trigger internals are sealed';
end $$;

-- PASS 9: anon cannot reach the two new client RPCs
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array['ensure_title','consume_rate_limit'])
    and has_function_privilege('anon', p.oid, 'execute');
  if bad is not null then
    raise exception 'FAIL 9: anon can execute: %', bad;
  end if;
  raise notice 'PASS 9: anon cannot execute ensure_title or consume_rate_limit';
end $$;

do $$ begin raise notice '=== ALL 9 HARDENING ASSERTIONS PASSED ==='; end $$;

rollback;

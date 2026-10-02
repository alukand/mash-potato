-- Feature flags on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/feature_flags_test.sql.
--
-- The point of running it here too: 20-grants.sql re-applies the platform's
-- blanket grants, so this proves the flag table stays read-only for clients
-- even on a project whose defaults hand every role everything.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now());

-- PASS 1: the seed ships off.
do $$
begin
  if (select enabled from public.feature_flags where key = 'livestreaming') is distinct from false then
    raise exception 'FAIL 1: livestreaming is not seeded off';
  end if;
  raise notice 'PASS 1: livestreaming ships OFF';
end $$;

-- PASS 2: read for everyone, write for no API role, after blanket grants.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s', r, p), ', ') into bad
    from unnest(array['anon', 'authenticated', 'service_role']) r
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.feature_flags', p);
  if bad is not null then
    raise exception 'FAIL 2: write privileges on feature_flags: %', bad;
  end if;
  if not (has_table_privilege('anon', 'public.feature_flags', 'SELECT')
          and has_table_privilege('authenticated', 'public.feature_flags', 'SELECT')
          and has_table_privilege('service_role', 'public.feature_flags', 'SELECT')) then
    raise exception 'FAIL 2: a role that must read feature_flags cannot';
  end if;
  raise notice 'PASS 2: feature_flags is read-only for anon, authenticated and service_role';
end $$;

-- PASS 3: anon reads the row and cannot flip it.
set local role anon;
do $$
begin
  if (select enabled from public.feature_flags where key = 'livestreaming') is distinct from false then
    raise exception 'FAIL 3: anon cannot read the livestreaming row';
  end if;
  begin
    update public.feature_flags set enabled = true where key = 'livestreaming';
    raise exception 'FAIL 3: anon turned livestreaming on';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.feature_flags (key, enabled) values ('anon_flag', true);
    raise exception 'FAIL 3: anon added a flag';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 3: anon reads flags and cannot write them';
end $$;
reset role;

-- PASS 4: a signed-in user reads the row and cannot flip or delete it.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  if (select enabled from public.feature_flags where key = 'livestreaming') is distinct from false then
    raise exception 'FAIL 4: a signed-in user cannot read the livestreaming row';
  end if;
  begin
    update public.feature_flags set enabled = true where key = 'livestreaming';
    raise exception 'FAIL 4: a signed-in user turned livestreaming on';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.feature_flags where key = 'livestreaming';
    raise exception 'FAIL 4: a signed-in user deleted a flag';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 4: a signed-in user reads flags and cannot write them';
end $$;
reset role;

-- PASS 5: the operator flip (docs/LIVE.md) works and stamps updated_at.
update public.feature_flags set enabled = true, updated_at = '2000-01-01'
 where key = 'livestreaming';
do $$
begin
  if not (select enabled and updated_at > '2000-01-02'
            from public.feature_flags where key = 'livestreaming') then
    raise exception 'FAIL 5: the SQL Editor flip did not take, or updated_at was not stamped';
  end if;
  raise notice 'PASS 5: the documented flip works and updated_at is trigger-stamped';
end $$;

rollback;

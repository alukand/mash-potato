-- Join requests on vanilla Postgres. Plain-SQL twin of
-- supabase/tests/join_requests_test.sql.
--
-- Run after 20-grants.sql, so it also proves the requests table stays
-- RPC-only on a project whose defaults hand every role everything.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ola@test.dev', '{"display_name":"Ola"}', now(), now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now());
update public.profiles set accepted_terms_at = now();

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('f3000000-0000-4000-8000-000000000001', 'Late Night Club', '11111111-1111-1111-1111-111111111111');
insert into public.group_discovery (group_id, searchable)
values ('f3000000-0000-4000-8000-000000000001', true);

-- PASS 1: no client role reaches the table, even after the blanket grants.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s', r, p), ', ') into bad
    from unnest(array['anon', 'authenticated']) r
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where has_table_privilege(r, 'public.group_join_requests', p);
  if bad is not null then
    raise exception 'FAIL 1: privileges on group_join_requests: %', bad;
  end if;
  if has_function_privilege('anon', 'public.request_to_join(uuid, text)', 'EXECUTE') then
    raise exception 'FAIL 1: anon can ask to join';
  end if;
  raise notice 'PASS 1: group_join_requests is RPC-only';
end $$;

-- PASS 2: approval cannot be skipped, and approving makes a member.
set local role authenticated;
do $$
begin
  perform public.set_group_join_policy('f3000000-0000-4000-8000-000000000001', 'approval', 'Last film that made you cry?');
end $$;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  begin
    perform public.join_open_group('f3000000-0000-4000-8000-000000000001');
    raise exception 'FAIL 2: join_open_group skipped approval';
  exception when raise_exception then
    if sqlerrm <> 'this group reviews requests to join' then raise; end if;
  end;
  if public.request_to_join('f3000000-0000-4000-8000-000000000001', 'Coco') <> 'pending' then
    raise exception 'FAIL 2: the request did not go in';
  end if;
end $$;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  select id into v_id from public.pending_join_requests('f3000000-0000-4000-8000-000000000001');
  perform public.decide_join_request(v_id, true);
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.group_members
                  where group_id = 'f3000000-0000-4000-8000-000000000001'
                    and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
    raise exception 'FAIL 2: approval did not add the member';
  end if;
  raise notice 'PASS 2: approval cannot be skipped, and approving adds the member';
end $$;

rollback;

-- session_rsvps: group-visible, self-answerable, outsiders see nothing.
-- Cast: Ana (owner), Ben (member), Cara (outsider).

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ana@test.dev', '{"display_name":"Ana"}', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ben@test.dev', '{"display_name":"Ben"}', now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cara@test.dev', '{"display_name":"Cara"}', now(), now());

insert into public.titles (id, tmdb_id, media_type, name, year)
values ('77777777-7777-7777-7777-777777777777', 693134, 'movie', 'Dune: Part Two', 2024);

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Test Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');
insert into public.reveal_sessions (id, group_id, title_id, created_by)
values ('66666666-6666-6666-6666-666666666666',
        '99999999-9999-9999-9999-999999999999',
        '77777777-7777-7777-7777-777777777777',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Ana (creator) is in.
insert into public.session_rsvps (session_id, member_id, status)
values ('66666666-6666-6666-6666-666666666666',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'in');

-- ---- Ben passes, and can see Ana's answer ----
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

insert into public.session_rsvps (session_id, member_id, status)
values ('66666666-6666-6666-6666-666666666666',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pass');

do $$
declare c int;
begin
  select count(*) into c from public.session_rsvps;
  if c <> 2 then raise exception 'FAIL 1: Ben should see both RSVPs (rows=%)', c; end if;
  raise notice 'PASS 1: members see the whole session''s RSVPs';
end $$;

-- Ben cannot answer for Ana.
do $$
begin
  begin
    update public.session_rsvps set status = 'pass'
      where member_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    if not found then
      raise notice 'PASS 2: Ben cannot change Ana''s RSVP';
    else
      raise exception 'FAIL 2: Ben changed Ana''s RSVP';
    end if;
  end;
end $$;

-- Ben changes his own mind (pass -> in): joining later is always allowed.
update public.session_rsvps set status = 'in'
  where member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

do $$
declare s text;
begin
  select status into s from public.session_rsvps
    where member_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if s <> 'in' then raise exception 'FAIL 3: Ben could not flip pass -> in (status=%)', s; end if;
  raise notice 'PASS 3: a passer can join back in';
end $$;

-- ---- Cara (outsider) sees nothing and cannot RSVP ----
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
declare c int;
begin
  select count(*) into c from public.session_rsvps;
  if c <> 0 then raise exception 'FAIL 4: outsider sees % RSVPs', c; end if;
  raise notice 'PASS 4: an outsider sees no RSVPs';
end $$;

do $$
begin
  begin
    insert into public.session_rsvps (session_id, member_id, status)
    values ('66666666-6666-6666-6666-666666666666',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', 'in');
    raise exception 'FAIL 5: an outsider RSVPed to a group session';
  exception
    when insufficient_privilege then
      raise notice 'PASS 5: an outsider cannot RSVP';
  end;
end $$;

do $$ begin raise notice '=== ALL 5 SESSION-RSVPS ASSERTIONS PASSED ==='; end $$;

rollback;

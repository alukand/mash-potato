-- Group polls, proven against live RLS: owner-gated creation/closing,
-- self-only switchable votes, member-only visibility, majority winner.
-- Plain-SQL twin of supabase/tests/group_polls_test.sql.

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
values ('11111111-1111-1111-1111-111111111111', 508442, 'movie', 'Soul', 2020),
       ('22222222-2222-2222-2222-222222222222', 693134, 'movie', 'Dune: Part Two', 2024),
       ('33333333-3333-3333-3333-333333333333', 129, 'movie', 'Spirited Away', 2001);

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.groups (id, name, owner_id)
values ('99999999-9999-9999-9999-999999999999', 'Vote Crew',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.group_members (group_id, user_id, role)
values ('99999999-9999-9999-9999-999999999999',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- PASS 1: a member cannot start a vote
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
begin
  begin
    perform public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222']::uuid[]);
    raise exception 'FAIL 1: a member started a vote';
  exception when raise_exception then
    if sqlerrm = 'only the group owner can start a vote' then
      raise notice 'PASS 1: a member cannot start a vote';
    else raise; end if;
  end;
end $$;

-- PASS 2: a single option is not a vote
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  begin
    perform public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111']::uuid[]);
    raise exception 'FAIL 2: a one-option vote was accepted';
  exception when raise_exception then
    if sqlerrm = 'a vote needs 2 to 5 options' then
      raise notice 'PASS 2: a single option is not a vote';
    else raise; end if;
  end;
end $$;

-- PASS 3: the owner opens a vote
do $$
begin
  perform public.create_group_poll('99999999-9999-9999-9999-999999999999',
    array['11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333']::uuid[]);
  raise notice 'PASS 3: the owner opened a vote with three options';
end $$;

-- PASS 4: one open vote per group
do $$
begin
  begin
    perform public.create_group_poll('99999999-9999-9999-9999-999999999999',
      array['11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222']::uuid[]);
    raise exception 'FAIL 4: a second open vote was accepted';
  exception when raise_exception then
    if sqlerrm = 'this group already has an open vote' then
      raise notice 'PASS 4: one open vote per group';
    else raise; end if;
  end;
end $$;

-- PASS 5: an outsider sees no polls
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$
declare c int;
begin
  select count(*) into c from public.group_polls;
  if c <> 0 then raise exception 'FAIL 5: an outsider sees % polls', c; end if;
  raise notice 'PASS 5: an outsider sees no polls';
end $$;

-- PASS 6 + 7: a member sees the vote and its options
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
declare p int; o int;
begin
  select count(*) into p from public.group_polls;
  select count(*) into o from public.poll_options;
  if p <> 1 then raise exception 'FAIL 6: member sees % polls', p; end if;
  raise notice 'PASS 6: a member sees the vote';
  if o <> 3 then raise exception 'FAIL 7: member sees % options', o; end if;
  raise notice 'PASS 7: a member sees the options';
end $$;

-- PASS 8: a member casts their vote
do $$
begin
  insert into public.poll_votes (poll_id, option_id, member_id)
  select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  from public.poll_options o where o.sort = 2;
  raise notice 'PASS 8: a member casts their vote';
end $$;

-- PASS 9: nobody votes on someone else's behalf
do $$
begin
  begin
    insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    from public.poll_options o where o.sort = 1;
    raise exception 'FAIL 9: a forged vote landed';
  exception when insufficient_privilege then
    raise notice 'PASS 9: nobody votes on someone else''s behalf';
  end;
end $$;

-- PASS 10: switching your vote is one upsert
do $$
begin
  insert into public.poll_votes (poll_id, option_id, member_id)
  select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  from public.poll_options o where o.sort = 3
  on conflict (poll_id, member_id)
    do update set option_id = excluded.option_id;
  raise notice 'PASS 10: switching your vote is one upsert';
end $$;

-- PASS 11: a member cannot close the vote
do $$
begin
  begin
    perform public.close_group_poll(
      (select id from public.group_polls where status = 'open'));
    raise exception 'FAIL 11: a member closed the vote';
  exception when raise_exception then
    if sqlerrm = 'only the group owner can close the vote' then
      raise notice 'PASS 11: a member cannot close the vote';
    else raise; end if;
  end;
end $$;

-- Ana votes option 3 too: clear majority.
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.poll_votes (poll_id, option_id, member_id)
  select o.poll_id, o.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  from public.poll_options o where o.sort = 3;

-- PASS 12 + 13: the owner closes it and the majority option wins
do $$
declare w int;
begin
  perform public.close_group_poll(
    (select id from public.group_polls where status = 'open'));
  raise notice 'PASS 12: the owner closed the vote';
  select o.sort into w from public.group_polls p
    join public.poll_options o on o.id = p.winner_option_id
    where p.group_id = '99999999-9999-9999-9999-999999999999';
  if w is distinct from 3 then
    raise exception 'FAIL 13: winner sort is % (expected 3)', w;
  end if;
  raise notice 'PASS 13: the most-voted option wins';
end $$;

-- PASS 14: a closed vote takes no more ballots
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
do $$
begin
  begin
    insert into public.poll_votes (poll_id, option_id, member_id)
    select o.poll_id, o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    from public.poll_options o where o.sort = 1
    on conflict (poll_id, member_id)
      do update set option_id = excluded.option_id;
    raise exception 'FAIL 14: a closed vote took a ballot';
  exception when insufficient_privilege then
    raise notice 'PASS 14: a closed vote takes no more ballots';
  end;
end $$;

do $$ begin raise notice '=== ALL 14 POLL ASSERTIONS PASSED — owner-gated votes, self-only switchable ballots, majority wins ==='; end $$;

rollback;

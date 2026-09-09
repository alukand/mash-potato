\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ana@test.dev','{"display_name":"Ana"}'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ben@test.dev','{"display_name":"Ben"}'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','cara@test.dev','{"display_name":"Cara"}');
insert into public.groups(id,name,owner_id,taste_mode) values
 ('99999999-9999-9999-9999-999999999999','Test Group 1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','buff'),
 ('88888888-8888-8888-8888-888888888888','Private crew','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','buff');
create function pg_temp.check_true(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end; $$;
select pg_temp.check_true(not has_function_privilege('anon','public.join_open_group(uuid)','EXECUTE'),'anon cannot join');
select pg_temp.check_true(not has_function_privilege('anon','public.my_onboarding()','EXECUTE'),'anon cannot read onboarding');
select pg_temp.check_true(not has_function_privilege('authenticated','public.remember_group_removal()','EXECUTE'),'removal trigger is internal');
select pg_temp.check_true(not has_table_privilege('authenticated','public.group_discovery','INSERT'),'directory cannot be forged directly');
select pg_temp.check_true(not has_table_privilege('authenticated','public.onboarding_progress','UPDATE'),'progress is RPC-only');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.set_group_discoverable('99999999-9999-9999-9999-999999999999',true);
reset role;
update public.group_discovery set suggested=true where group_id='99999999-9999-9999-9999-999999999999';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.check_true((select count(*)=1 from public.browse_open_groups('',false)),'public catalogue includes only open groups');
select pg_temp.check_true((select count(*)=1 from public.browse_open_groups('test group',true)),'suggestions match the curated group');
select pg_temp.check_true((select count(*)=0 from public.browse_open_groups('%',false)),'search treats wildcards literally');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select pg_temp.check_true((select count(*)=0 from public.groups),'directory does not open private group rows');
select pg_temp.check_true((public.my_onboarding()->>'completed')::boolean=false,'new account needs setup');
do $$ begin
  begin perform public.set_group_discoverable('88888888-8888-8888-8888-888888888888',true); raise exception 'FAIL: outsider listed private group';
  exception when raise_exception then if sqlerrm <> 'only the group owner can change discovery' then raise; end if; end;
  begin perform public.join_open_group('88888888-8888-8888-8888-888888888888'); raise exception 'FAIL: outsider joined private group';
  exception when raise_exception then if sqlerrm <> 'this group is not open to join' then raise; end if; end;
end $$;
select public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":80,"enabled":true,"sort":0}]');
select public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":70,"enabled":true,"sort":0}]');
select pg_temp.check_true((select count(*)=1 from public.user_rubrics),'setup retry updates the same favorite');
do $$ begin
  begin perform public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":"70","enabled":true,"sort":0}]'); raise exception 'FAIL: accepted string weight';
  exception when raise_exception then if sqlerrm <> 'invalid rubric category' then raise; end if; end;
end $$;
select pg_temp.check_true((select (rows->0->>'weight')::int=70 from public.user_rubrics where is_favorite),'invalid save preserves favorite');
select public.complete_onboarding('99999999-9999-9999-9999-999999999999');
select public.complete_onboarding('99999999-9999-9999-9999-999999999999');
select pg_temp.check_true((select count(*)=1 from public.group_members where user_id=auth.uid()),'repeat join is idempotent');
select pg_temp.check_true((select role='member' from public.group_members where user_id=auth.uid()),'join never grants owner');
select pg_temp.check_true((select weight=70 from public.member_rubrics where user_id=auth.uid() and category_key='story'),'favorite is seeded before joining');
select pg_temp.check_true((public.my_onboarding()->>'completed')::boolean,'completion persists by account');
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select pg_temp.check_true((public.my_onboarding()->>'completed')::boolean=false,'another account keeps its own setup state');
select public.complete_onboarding();
select pg_temp.check_true((select count(*)=1 from public.group_members where user_id=auth.uid()),'skipping customization still joins the starter group');
delete from public.group_members where group_id='99999999-9999-9999-9999-999999999999' and user_id=auth.uid();
select public.join_open_group('99999999-9999-9999-9999-999999999999');
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
delete from public.group_members where group_id='99999999-9999-9999-9999-999999999999' and user_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
do $$ begin
  begin perform public.join_open_group('99999999-9999-9999-9999-999999999999'); raise exception 'FAIL: removed member rejoined';
  exception when raise_exception then if sqlerrm <> 'this group is not open to join' then raise; end if; end;
end $$;
-- Joining a directory group must not open existing revealed scores.
reset role;
insert into public.titles(id,name,media_type) values('77777777-7777-7777-7777-777777777777','Blind test','movie');
insert into public.reveal_sessions(id,group_id,title_id,state,created_by,rubric) values
 ('66666666-6666-6666-6666-666666666666','99999999-9999-9999-9999-999999999999','77777777-7777-7777-7777-777777777777','revealed','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','[{"key":"story","label":"Story","weight":30,"sort":0}]');
insert into public.member_scores(session_id,member_id,scores,locked) values
 ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"story":9}',true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select pg_temp.check_true((select count(*)=0 from public.member_scores),'new member stays blind on old reveals');
rollback;

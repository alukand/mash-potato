create extension if not exists pgtap with schema extensions;
begin;
select plan(25);
insert into auth.users(id,email,raw_user_meta_data) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ana@test.dev','{"display_name":"Ana"}'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ben@test.dev','{"display_name":"Ben"}'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','cara@test.dev','{"display_name":"Cara"}');
insert into public.groups(id,name,owner_id,taste_mode) values
 ('99999999-9999-9999-9999-999999999999','Test Group 1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','buff'),
 ('88888888-8888-8888-8888-888888888888','Private crew','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','buff');
select ok(not has_function_privilege('anon','public.join_open_group(uuid)','EXECUTE'),'anon cannot join');
select ok(not has_function_privilege('anon','public.my_onboarding()','EXECUTE'),'anon cannot read setup');
select ok(not has_function_privilege('authenticated','public.remember_group_removal()','EXECUTE'),'removal trigger is internal');
select ok(not has_table_privilege('authenticated','public.group_discovery','INSERT'),'cannot forge directory entries');
select ok(not has_table_privilege('authenticated','public.onboarding_progress','UPDATE'),'cannot forge setup state');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select public.set_group_discoverable('99999999-9999-9999-9999-999999999999',true);
reset role;
update public.group_discovery set suggested=true where group_id='99999999-9999-9999-9999-999999999999';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from public.browse_open_groups('',false)),1,'only open groups are browsable');
select is((select count(*)::int from public.browse_open_groups('test group',true)),1,'suggestions are explicitly curated');
select is((select count(*)::int from public.browse_open_groups('%',false)),0,'search treats wildcard as literal');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*)::int from public.groups),0,'directory does not expose private group rows');
select is((public.my_onboarding()->>'completed')::boolean,false,'new account begins setup');
select throws_ok($$select public.set_group_discoverable('88888888-8888-8888-8888-888888888888',true)$$,'P0001','only the group owner can change discovery','outsider cannot list another group');
select throws_ok($$select public.join_open_group('88888888-8888-8888-8888-888888888888')$$,'P0001','this group is not open to join','cannot join private group');
select public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":70,"enabled":true,"sort":0}]');
select public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":70,"enabled":true,"sort":0}]');
select is((select count(*)::int from public.user_rubrics),1,'retry saves the same rubric');
select throws_ok($$select public.save_onboarding_rubric('Ben','[{"key":"story","label":"Story","weight":"70","enabled":true,"sort":0}]')$$,'P0001','invalid rubric category','string weights cannot corrupt a preset');
select is((select (rows->0->>'weight')::int from public.user_rubrics where is_favorite),70,'failed saves preserve the favorite');
select throws_ok($$select public.complete_onboarding('88888888-8888-8888-8888-888888888888')$$,'P0001','this group is not open to join','failed joins cannot complete setup');
select is((public.my_onboarding()->>'completed')::boolean,false,'setup remains retryable after a failed join');
select public.complete_onboarding('99999999-9999-9999-9999-999999999999');
select public.complete_onboarding('99999999-9999-9999-9999-999999999999');
select is((select count(*)::int from public.group_members where user_id=auth.uid()),1,'joining is idempotent');
select is((select role::text from public.group_members where user_id=auth.uid()),'member','joining cannot promote to owner');
select is((select weight from public.member_rubrics where user_id=auth.uid() and category_key='story'),70,'saved favorite seeds membership');
select is((public.my_onboarding()->>'completed')::boolean,true,'completion is account scoped');
reset role;
insert into public.titles(id,name,media_type) values('77777777-7777-7777-7777-777777777777','Blind test','movie');
insert into public.reveal_sessions(id,group_id,title_id,state,created_by,rubric) values
 ('66666666-6666-6666-6666-666666666666','99999999-9999-9999-9999-999999999999','77777777-7777-7777-7777-777777777777','revealed','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','[{"key":"story","label":"Story","weight":30,"sort":0}]');
insert into public.member_scores(session_id,member_id,scores,locked) values
 ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"story":9}',true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*)::int from public.member_scores),0,'joined member stays blind on old reveals');
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
delete from public.group_members where group_id='99999999-9999-9999-9999-999999999999' and user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok($$select public.join_open_group('99999999-9999-9999-9999-999999999999')$$,'P0001','this group is not open to join','removed member cannot immediately rejoin');
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select public.complete_onboarding();
select is((select count(*)::int from public.group_members where user_id=auth.uid()),1,'skipping customization joins the suggested group automatically');
select is((public.my_onboarding()->>'completed')::boolean,true,'default setup is completed');
select * from finish();
rollback;

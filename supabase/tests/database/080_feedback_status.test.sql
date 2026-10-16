begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into auth.users(id,email) values
 ('80000000-0000-4000-8000-000000000001','feedback-status@test.local');
insert into public.profiles(id,name,email) values
 ('80000000-0000-4000-8000-000000000001','Feedback','feedback-status@test.local');
set local role authenticated;
set local request.jwt.claim.sub='80000000-0000-4000-8000-000000000001';
select lives_ok($$insert into public.app_feedback(id,user_id,feedback_type,category,message,platform)
 values('81000000-0000-4000-8000-000000000001',auth.uid(),'improvement','other','Improve this','ios')$$,
 'old clients can still submit');
select throws_ok($$insert into public.app_feedback(user_id,feedback_type,category,message,status)
 values(auth.uid(),'improvement','other','Forged','released')$$,'42501',null,'clients cannot set status on submission');
select throws_ok($$update public.app_feedback set status='in_progress'$$,'42501',null,'clients cannot change status');
select throws_ok($$select public.notify_feedback_status_change_v1()$$,'42501',null,'clients cannot invoke internal trigger');
reset role;
select is((select count(*) from public.notifications where entity_type='feedback'),0::bigint,'submission sends no progress promise');
update public.app_feedback set status='in_progress' where id='81000000-0000-4000-8000-000000000001';
select is((select count(*) from public.notifications where type='feedback_in_progress'),1::bigint,'work starts notification created');
select is((select count(*) from public.notification_push_jobs j join public.notifications n on n.id=j.notification_id where n.type='feedback_in_progress'),1::bigint,'push queued atomically');
update public.app_feedback set status='reviewed' where id='81000000-0000-4000-8000-000000000001';
update public.app_feedback set status='in_progress' where id='81000000-0000-4000-8000-000000000001';
select is((select count(*) from public.notifications where type='feedback_in_progress'),1::bigint,'repeated transition does not spam');
select throws_ok($$update public.app_feedback set status='released' where id='81000000-0000-4000-8000-000000000001'$$,'23514',null,'release requires a version');
update public.app_feedback set status='fixed' where id='81000000-0000-4000-8000-000000000001';
select is((select count(*) from public.notifications where entity_type='feedback'),1::bigint,'fixed code is not announced as released');
update public.app_feedback set status='released',released_version='1.0.7' where id='81000000-0000-4000-8000-000000000001';
select is((select count(*) from public.notifications where type='feedback_released' and recipient_id='80000000-0000-4000-8000-000000000001'),1::bigint,'release notifies original contributor');
select is((select count(*) from public.feedback_status_events),5::bigint,'successful transitions audited; failed release rolled back');
select * from finish();
rollback;

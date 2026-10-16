begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id,email) values
 ('30000000-0000-4000-8000-000000000001','notify-a@test.local'),
 ('30000000-0000-4000-8000-000000000002','notify-b@test.local');
insert into public.profiles(id,name,email) values
 ('30000000-0000-4000-8000-000000000001','Notify A','notify-a@test.local'),
 ('30000000-0000-4000-8000-000000000002','Notify B','notify-b@test.local');
insert into public.notifications(id,recipient_id,type,title,body,entity_type,entity_id,push_status) values
 ('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','followed_you','A','A','profile','30000000-0000-4000-8000-000000000002','pending'),
 ('31000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','followed_you','B','B','profile','30000000-0000-4000-8000-000000000001','pending');

select ok(
  has_column_privilege('authenticated','public.app_feedback','message','INSERT'),
  'authenticated role can reach feedback insert through the Data API'
);
select ok(
  not has_table_privilege('anon','public.app_feedback','INSERT'),
  'anonymous role cannot insert feedback'
);

set local role authenticated;
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';

select is((select count(*) from public.notifications),1::bigint,'user sees only own notifications');
select ok(public.mark_notification_read('31000000-0000-4000-8000-000000000001'),'user can mark own notification read');
select ok(not public.mark_notification_read('31000000-0000-4000-8000-000000000002'),'user cannot mark another notification read');
select is((select is_read from public.notifications where id='31000000-0000-4000-8000-000000000001'),true,'own notification becomes read');

select lives_ok(
 $$ update public.notification_preferences set push_enabled=false where user_id='30000000-0000-4000-8000-000000000001' $$,
 'user can update own notification preferences'
);
select results_eq(
 $actual$ update public.notification_preferences set push_enabled=false where user_id='30000000-0000-4000-8000-000000000002' returning 1 $actual$,
 $expected$ select 1 where false $expected$,
 'user cannot update another users notification preferences'
);

select lives_ok(
 $$ insert into public.app_feedback(user_id,feedback_type,category,message,platform)
    values('30000000-0000-4000-8000-000000000001','improvement','other','More tests please','ios') $$,
 'user can submit own feedback'
);
select throws_ok(
 $$ insert into public.app_feedback(user_id,feedback_type,category,message,platform)
    values('30000000-0000-4000-8000-000000000002','issue','other','Forged','ios') $$,
 '42501', null, 'user cannot submit feedback as another user'
);
select throws_ok(
 $$ insert into public.app_feedback(user_id,feedback_type,category,message,platform)
    values('30000000-0000-4000-8000-000000000001','rating',null,null,'ios') $$,
 '23514', null, 'invalid feedback shape is rejected by database constraints'
);
select throws_ok(
 $$ insert into public.app_feedback(user_id,feedback_type,category,message,rating_tags,platform)
    values('30000000-0000-4000-8000-000000000001','improvement','other','Bad tag',array['not_allowed'],'ios') $$,
 '23514', null, 'invalid feedback tags are rejected'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into auth.users(id,email) values
 ('a0000000-0000-4000-8000-000000000001','summary-a@test.local'),
 ('a0000000-0000-4000-8000-000000000002','summary-b@test.local');
insert into public.profiles(id,name,email) values
 ('a0000000-0000-4000-8000-000000000001','Summary A','summary-a@test.local'),
 ('a0000000-0000-4000-8000-000000000002','Summary B','summary-b@test.local');
insert into public.exercises(id,name,type,is_public) values
 ('a1000000-0000-4000-8000-000000000001','Summary run','cardio',true),
 ('a1000000-0000-4000-8000-000000000002','Summary bench','strength',true);
insert into public.workout_history(id,user_id,duration_seconds) values
 ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',1800),
 ('a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',3600),
 ('a2000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',2400);
insert into public.workout_exercise_history(id,workout_history_id,exercise_id,order_index) values
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',0),
 ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002',0),
 ('a3000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',0),
 ('a3000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002',1);
insert into public.workout_set_history(workout_exercise_history_id,set_number,weight,reps,time_seconds,distance) values
 ('a3000000-0000-4000-8000-000000000001',1,null,null,600,2),
 ('a3000000-0000-4000-8000-000000000001',2,null,null,900,3),
 ('a3000000-0000-4000-8000-000000000002',1,100,10,null,null),
 ('a3000000-0000-4000-8000-000000000003',1,null,null,600,2),
 ('a3000000-0000-4000-8000-000000000004',1,50,10,null,null);
insert into public.posts(id,user_id,post_type,visibility,workout_history_id) values
 ('a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','workout','private','a2000000-0000-4000-8000-000000000001'),
 ('a4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','workout','private','a2000000-0000-4000-8000-000000000002'),
 ('a4000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','workout','private','a2000000-0000-4000-8000-000000000003');
set local role authenticated;
set local request.jwt.claim.sub='a0000000-0000-4000-8000-000000000001';
select is((select workout_snapshot->>'workout_kind' from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000001'),'cardio','cardio classified by exercise type');
select is((select (workout_snapshot->>'total_distance_km')::numeric from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000001'),5::numeric,'interval distances summed in kilometres');
select is((select (workout_snapshot->>'cardio_duration_seconds')::integer from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000001'),1500,'cardio time uses logged intervals');
select is((select (workout_snapshot->>'duration_seconds')::integer from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000001'),1800,'elapsed time retained separately');
select is((select (workout_snapshot->>'total_distance_km')::numeric from public.get_post_detail_v1('a4000000-0000-4000-8000-000000000001')),5::numeric,'detail returns same distance');
select is((select (p->'workout_snapshot'->>'total_distance_km')::numeric from public.get_profile_overview_v1('a0000000-0000-4000-8000-000000000001') o cross join lateral jsonb_array_elements(o.recent_posts) p where p->>'post_id'='a4000000-0000-4000-8000-000000000001'),5::numeric,'profile returns same distance');
select is((select workout_snapshot->>'workout_kind' from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000002'),'strength','strength stays strength');
select is((select (workout_snapshot->>'total_volume')::numeric from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000002'),1000::numeric,'strength volume unchanged');
select is((select workout_snapshot->>'workout_kind' from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000003'),'mixed','mixed session classified');
select is((select (workout_snapshot->>'total_distance_km')::numeric from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000003'),2::numeric,'mixed session includes cardio');
select is((select (workout_snapshot->>'total_volume')::numeric from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000003'),500::numeric,'mixed session retains lifting volume');
select is((select (workout_snapshot->>'sets_count')::integer from public.get_feed() where post_id='a4000000-0000-4000-8000-000000000001'),2,'set counts unchanged');
set local request.jwt.claim.sub='a0000000-0000-4000-8000-000000000002';
select is((select count(*) from public.get_feed()),0::bigint,'private summaries hidden from other user');
select is((select count(*) from public.get_post_detail_v1('a4000000-0000-4000-8000-000000000001')),0::bigint,'private details remain hidden');
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
insert into auth.users(id,email) values ('c0000000-0000-4000-8000-000000000001','boundary@test.local');
insert into public.profiles(id,name,email,timezone) values
 ('c0000000-0000-4000-8000-000000000001','Boundary','boundary@test.local','UTC');
insert into public.exercises(id,name,type,is_public) values
 ('c1000000-0000-4000-8000-000000000001','Boundary run','cardio',true);
insert into public.workout_history(id,user_id,completed_at) values
 ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',now()-interval '365 days'),
 ('c2000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',now()-interval '365 days 1 second'),
 ('c2000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001',now()-interval '364 days 23 hours 59 minutes 59 seconds');
insert into public.workout_exercise_history(id,workout_history_id,exercise_id,order_index) values
 ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',0),
 ('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001',0),
 ('c3000000-0000-4000-8000-000000000003','c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001',0);
insert into public.workout_set_history(workout_exercise_history_id,set_number,distance,time_seconds) values
 ('c3000000-0000-4000-8000-000000000001',1,2,600),
 ('c3000000-0000-4000-8000-000000000002',1,99,9999),
 ('c3000000-0000-4000-8000-000000000003',1,3,900);
set local role authenticated;
set local request.jwt.claim.sub='c0000000-0000-4000-8000-000000000001';
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->>'session_count')::int,2,'exact annual boundary included; one second before excluded');
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->>'total_distance_km')::numeric,5::numeric,'annual distance is exact at cutoff');
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->>'total_duration_seconds')::int,1500,'annual duration is exact at cutoff');
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->>'average_pace_seconds_per_km')::numeric,300::numeric,'boundary pace is weighted correctly');
select is(jsonb_array_length(public.get_workout_history_feed()->'items'),3,'older workout remains in all-time history');
select is((public.get_workout_history_detail('c2000000-0000-4000-8000-000000000002')->'stats'->>'distance_total')::numeric,99::numeric,'older workout detail retains original distance');
set local role postgres;
update public.profiles set timezone='Pacific/Kiritimati' where id='c0000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->>'session_count')::int,2,'timezone does not shift rolling instant cutoff');
select is(public.get_workout_history_feed()->'meta'->>'timezone','Pacific/Kiritimati','history returns configured timezone');
select is((public.get_exercise_deep_analytics('c1000000-0000-4000-8000-000000000001')->'cardio'->'latest'->>'session_id'),'c2000000-0000-4000-8000-000000000003','latest session ordered by instant');
select * from finish();
rollback;

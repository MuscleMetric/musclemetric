begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
insert into auth.users(id,email) values
 ('b0000000-0000-4000-8000-000000000001','cardio-a@test.local'),
 ('b0000000-0000-4000-8000-000000000002','cardio-b@test.local');
insert into public.profiles(id,name,email) values
 ('b0000000-0000-4000-8000-000000000001','Cardio A','cardio-a@test.local'),
 ('b0000000-0000-4000-8000-000000000002','Cardio B','cardio-b@test.local');
insert into public.exercises(id,name,type,is_public) values
 ('b1000000-0000-4000-8000-000000000001','Analytics run','cardio',true),
 ('b1000000-0000-4000-8000-000000000002','Analytics bench',null,true);
insert into public.workout_history(id,user_id,completed_at) values
 ('b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',now()-interval '3 days'),
 ('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',now()-interval '2 days'),
 ('b2000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('b2000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001',now()-interval '400 days'),
 ('b2000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000002',now());
insert into public.workout_exercise_history(id,workout_history_id,exercise_id,order_index) values
 ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',0),
 ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001',0),
 ('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001',0),
 ('b3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001',0),
 ('b3000000-0000-4000-8000-000000000005','b2000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000001',0),
 ('b3000000-0000-4000-8000-000000000006','b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002',1);
insert into public.workout_set_history(workout_exercise_history_id,set_number,distance,time_seconds,weight,reps) values
 ('b3000000-0000-4000-8000-000000000001',1,2,600,null,null),
 ('b3000000-0000-4000-8000-000000000001',2,3,900,null,null),
 ('b3000000-0000-4000-8000-000000000002',1,null,600,null,null),
 ('b3000000-0000-4000-8000-000000000002',2,4,null,null,null),
 ('b3000000-0000-4000-8000-000000000003',1,10,2400,null,null),
 ('b3000000-0000-4000-8000-000000000004',1,99,99999,null,null),
 ('b3000000-0000-4000-8000-000000000005',1,88,88888,null,null),
 ('b3000000-0000-4000-8000-000000000006',1,null,null,100,5);
set local role authenticated;
set local request.jwt.claim.sub='b0000000-0000-4000-8000-000000000001';
select is(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'meta'->>'exercise_type','cardio','cardio payload tagged');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'session_count')::integer,3,'counts owned sessions in year');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'total_distance_km')::numeric,19::numeric,'sums kilometres without other user or old session');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'total_duration_seconds')::integer,4500,'sums recorded exercise seconds');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'average_pace_seconds_per_km')::numeric,260::numeric,'pace weighted by paired distance');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'longest_distance_km')::numeric,10::numeric,'longest owned session');
select is(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->'latest'->>'session_id','b2000000-0000-4000-8000-000000000003','latest session identified');
select is(jsonb_array_length(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->'sessions'),3,'trend sessions available');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->'sessions'->0->>'distance_km')::numeric,5::numeric,'intervals aggregate into one session');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->'sessions'->0->>'pace_seconds_per_km')::numeric,300::numeric,'session pace correct');
select is(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->'sessions'->1->>'pace_seconds_per_km',null::text,'separate incomplete rows never fabricate pace');
select ok(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001') ? 'charts','old payload retained for compatibility');
select is(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000002')->'meta'->>'exercise_type','strength','null type retains strength default');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000002')->'cards'->'current'->>'top_weight')::numeric,100::numeric,'strength query preserved');
select ok(not(public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000002') ? 'cardio'),'strength omits cardio data');
set local request.jwt.claim.sub='b0000000-0000-4000-8000-000000000002';
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'total_distance_km')::numeric,88::numeric,'other account sees only own distance');
select is((public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')->'cardio'->>'session_count')::integer,1,'other account sees own session count');
set local request.jwt.claim.sub='';
select throws_ok($$select public.get_exercise_deep_analytics('b1000000-0000-4000-8000-000000000001')$$,'P0001','Not authenticated','signed out access rejected');
select * from finish();
rollback;

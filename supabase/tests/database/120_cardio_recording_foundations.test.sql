begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users(id,email) values
 ('f0000000-0000-4000-8000-000000000001','cardio-foundations-a@test.local'),
 ('f0000000-0000-4000-8000-000000000002','cardio-foundations-b@test.local');
insert into public.profiles(id,name,email) values
 ('f0000000-0000-4000-8000-000000000001','Foundations A','cardio-foundations-a@test.local'),
 ('f0000000-0000-4000-8000-000000000002','Foundations B','cardio-foundations-b@test.local');
insert into public.workout_history(id,user_id,completed_at) values
 ('f3000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001',now()),
 ('f3000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000002',now());

select ok((select relrowsecurity from pg_class where oid='public.cardio_recordings'::regclass),
 'cardio recordings have row-level security');
select ok((select relrowsecurity from pg_class where oid='public.cardio_route_points'::regclass),
 'precise route samples have row-level security');
select ok((select relrowsecurity from pg_class where oid='public.cardio_splits'::regclass),
 'split records have row-level security');

set local role authenticated;
set local request.jwt.claim.sub='f0000000-0000-4000-8000-000000000001';

select lives_ok($$
 insert into public.cardio_recordings (id,user_id,started_at)
 values ('f2000000-0000-4000-8000-000000000001',
         'f0000000-0000-4000-8000-000000000001',
         now() - interval '30 minutes')
 $$, 'can start a run without categorising it prematurely');

select throws_ok($$
 insert into public.cardio_recordings
   (id,user_id,started_at,completed_at,status)
 values ('f2000000-0000-4000-8000-000000000002',
         'f0000000-0000-4000-8000-000000000001',
         now() - interval '30 minutes',now(),'completed')
 $$,'23514',null,'completed runs require a run type');

select lives_ok($$
 update public.cardio_recordings set
   status='completed', completed_at=now(), run_type='tempo',
   effort_rpe=7, distance_meters=5000, elapsed_seconds=1500,
   moving_seconds=1450
 where id='f2000000-0000-4000-8000-000000000001'
 $$,'a completed tempo run may include optional effort');

select is((select run_type from public.cardio_recordings
 where id='f2000000-0000-4000-8000-000000000001'),'tempo',
 'the run category is persisted');

select is((select effort_rpe from public.cardio_recordings
 where id='f2000000-0000-4000-8000-000000000001'),7::smallint,
 'the 1 to 10 effort rating is persisted');

select lives_ok($$
 insert into public.cardio_route_points
 (recording_id,point_index,recorded_at,elapsed_seconds,latitude,longitude,horizontal_accuracy_m)
 values ('f2000000-0000-4000-8000-000000000001',0,now(),0,51.5074,-0.1278,5)
 $$,'recording owner can write a GPS sample');

select lives_ok($$
 insert into public.cardio_splits
 (recording_id,split_index,distance_meters,duration_seconds,end_elapsed_seconds,source)
 values ('f2000000-0000-4000-8000-000000000001',1,1000,300,300,'gps')
 $$,'recording owner can save a measured kilometre split');

select is((select count(*) from public.cardio_route_points
 where recording_id='f2000000-0000-4000-8000-000000000001'),1::bigint,
 'GPS point can be read by its owner');

select lives_ok($$
 update public.cardio_recordings
 set workout_history_id='f3000000-0000-4000-8000-000000000001'
 where id='f2000000-0000-4000-8000-000000000001'
 $$,'owner can link a completed workout to the run');

select throws_ok($$
 update public.cardio_recordings set effort_rpe=11
 where id='f2000000-0000-4000-8000-000000000001'
 $$,'23514',null,'invalid RPE values are rejected');

select throws_ok($$
 insert into public.cardio_route_points
 (recording_id,point_index,recorded_at,elapsed_seconds,latitude,longitude)
 values ('f2000000-0000-4000-8000-000000000001',1,now(),10,91,0)
 $$,'23514',null,'out-of-bounds latitude is rejected');

select throws_ok($$
 insert into public.cardio_splits
 (recording_id,split_index,distance_meters,duration_seconds,end_elapsed_seconds)
 values ('f2000000-0000-4000-8000-000000000001',2,1000,0,600)
 $$,'23514',null,'zero-duration splits are rejected');

set local request.jwt.claim.sub='f0000000-0000-4000-8000-000000000002';

select is((select count(*) from public.cardio_recordings
 where id='f2000000-0000-4000-8000-000000000001'),0::bigint,
 'a second account cannot read a recording');
select is((select count(*) from public.cardio_route_points
 where recording_id='f2000000-0000-4000-8000-000000000001'),0::bigint,
 'a second account cannot read exact GPS locations');
select is((select count(*) from public.cardio_splits
 where recording_id='f2000000-0000-4000-8000-000000000001'),0::bigint,
 'a second account cannot read splits');

select throws_ok($$
 insert into public.cardio_route_points
 (recording_id,point_index,recorded_at,elapsed_seconds,latitude,longitude)
 values ('f2000000-0000-4000-8000-000000000001',1,now(),10,51.5,-0.12)
 $$,'42501',null,'second account cannot insert points on another route');

select throws_ok($$
 insert into public.cardio_splits
 (recording_id,split_index,distance_meters,duration_seconds,end_elapsed_seconds)
 values ('f2000000-0000-4000-8000-000000000001',2,1000,300,600)
 $$,'42501',null,'second account cannot insert splits for another run');

select throws_ok($$
 insert into public.cardio_recordings (id,user_id,started_at)
 values ('f2000000-0000-4000-8000-000000000003',
         'f0000000-0000-4000-8000-000000000001',now())
 $$,'42501',null,'second account cannot create a recording as the owner');

select throws_ok($$
 insert into public.cardio_recordings (id,user_id,started_at,workout_history_id)
 values ('f2000000-0000-4000-8000-000000000004',
         'f0000000-0000-4000-8000-000000000002',
         now(),'f3000000-0000-4000-8000-000000000001')
 $$,'23514',null,'cross-owner workout history cannot be linked');

set local request.jwt.claim.sub='f0000000-0000-4000-8000-000000000001';

select throws_ok($$
 update public.cardio_recordings
 set user_id='f0000000-0000-4000-8000-000000000002'
 where id='f2000000-0000-4000-8000-000000000001'
 $,'23514',null,'linked recording ownership cannot be reassigned (workout owner guard)');

select lives_ok($$
 delete from public.cardio_recordings
 where id='f2000000-0000-4000-8000-000000000001'
 $$,'owner can delete a recording');

select is((select count(*) from public.cardio_route_points
 where recording_id='f2000000-0000-4000-8000-000000000001'),0::bigint,
 'deleting a recording deletes precise route data');
select is((select count(*) from public.cardio_splits
 where recording_id='f2000000-0000-4000-8000-000000000001'),0::bigint,
 'deleting a recording deletes split data');


-- Deleting the saved workout must also erase the linked GPS track and splits.
select lives_ok($$
 insert into public.cardio_recordings
 (id,user_id,workout_history_id,status,run_type,started_at,completed_at)
 values ('f2000000-0000-4000-8000-000000000005',
         'f0000000-0000-4000-8000-000000000001',
         'f3000000-0000-4000-8000-000000000001',
         'completed','easy',now() - interval '1 minute',now())
 $$, 'owner can link another completed run to its own workout');

select lives_ok($$
 insert into public.cardio_route_points
 (recording_id,point_index,recorded_at,elapsed_seconds,latitude,longitude)
 values ('f2000000-0000-4000-8000-000000000005',0,now(),0,51.5,-0.12)
 $$, 'linked run can contain exact GPS points');
select lives_ok($$
 insert into public.cardio_splits
 (recording_id,split_index,distance_meters,duration_seconds,end_elapsed_seconds)
 values ('f2000000-0000-4000-8000-000000000005',1,1000,300,300)
 $$, 'linked run can contain splits');

set local role postgres;
select lives_ok($$
 delete from public.workout_history where id='f3000000-0000-4000-8000-000000000001'
 $$, 'deleting the associated workout cascades to the recording');

select is((select count(*) from public.cardio_recordings
 where id='f2000000-0000-4000-8000-000000000005'),0::bigint,
 'deleting workout history removes its GPS recording');
select is((select count(*) from public.cardio_route_points
 where recording_id='f2000000-0000-4000-8000-000000000005'),0::bigint,
 'deleting workout history removes its precise coordinates');
select is((select count(*) from public.cardio_splits
 where recording_id='f2000000-0000-4000-8000-000000000005'),0::bigint,
 'deleting workout history removes its splits');

set local role anon;
select throws_ok($$select count(*) from public.cardio_route_points$$,
 '42501',null,'anonymous clients have no route access');
select throws_ok($$select count(*) from public.cardio_recordings$$,
 '42501',null,'anonymous clients have no recording access');

select * from finish();
rollback;

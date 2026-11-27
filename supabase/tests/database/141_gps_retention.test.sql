begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users(id,email) values ('14100000-0000-4000-8000-000000000001','retention@test.local');
insert into public.profiles(id,name,email) values ('14100000-0000-4000-8000-000000000001','Retention','retention@test.local');
insert into public.cardio_recordings(id,user_id,started_at,completed_at,status,run_type,distance_meters)
select id::uuid,'14100000-0000-4000-8000-000000000001',now()-age,now()-age+interval '1 hour','completed','easy',100
from (values ('14100000-0000-4000-8000-000000000002',interval '2160 hours'),
             ('14100000-0000-4000-8000-000000000003',interval '2159 hours')) as sample(id,age);
insert into public.cardio_route_points(recording_id,point_index,recorded_at,elapsed_seconds,latitude,longitude)
select id,0,started_at,0,0,0 from public.cardio_recordings where user_id='14100000-0000-4000-8000-000000000001';
insert into public.cardio_splits(recording_id,split_index,distance_meters,duration_seconds,end_elapsed_seconds)
select id,1,100,60,60 from public.cardio_recordings where user_id='14100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub='14100000-0000-4000-8000-000000000001';
select is((select count(*) from public.cardio_route_points),1::bigint,'only unexpired points are readable');
select is((select count(*) from public.cardio_splits),1::bigint,'only unexpired splits are readable');
select is((select sum(distance_meters) from public.cardio_recordings),200::numeric,'summary distances survive expiry');
reset role;
do $$ declare cleanup text; begin
 select command into strict cleanup from cron.job where jobname='purge-expired-private-gps' and active;
 execute cleanup;
end $$;
select is((select count(*) from public.cardio_route_points where recording_id='14100000-0000-4000-8000-000000000002'),0::bigint,'cleanup deletes expired points');
select is((select count(*) from public.cardio_splits where recording_id='14100000-0000-4000-8000-000000000002'),0::bigint,'cleanup deletes expired splits');
select is((select count(*) from public.cardio_recordings where user_id='14100000-0000-4000-8000-000000000001'),2::bigint,'cleanup keeps both completed summaries');
select * from finish();
rollback;

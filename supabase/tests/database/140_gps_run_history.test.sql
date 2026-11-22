begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id,email) values ('14000000-0000-4000-8000-000000000001','gps@test.local');
insert into public.profiles(id,name,email) values ('14000000-0000-4000-8000-000000000001','GPS tester','gps@test.local');
insert into public.exercises(id,name,type,is_public)
values ('14000000-0000-4000-8000-000000000002','GPS fixture run','cardio',true);

set local role authenticated;
set local request.jwt.claim.sub='14000000-0000-4000-8000-000000000001';
create function pg_temp.save_run() returns uuid language sql as $$
  select public.save_completed_workout_v2(
    jsonb_build_object('completed_at', now()) || '{
      "client_save_id":"14000000-0000-4000-8000-000000000003", "workout_id":null,
      "duration_seconds":375, "notes":"Easy outdoor run", "workout_exercise_updates":[],
      "exercise_history":[{"exercise_id":"14000000-0000-4000-8000-000000000002",
        "order_index":0,"notes":"","workout_exercise_id":"","is_dropset":false,"superset_group":"","superset_index":"",
        "sets":[{"set_number":1,"drop_index":0,"reps":null,"weight":null,"time_seconds":375,"distance":1.25,"notes":null}]}]
    }'::jsonb, auth.uid())
$$;
select lives_ok('select pg_temp.save_run()', 'GPS session saves without a workout template');
select is(pg_temp.save_run(), (select id from public.workout_history
  where client_save_id='14000000-0000-4000-8000-000000000003'), 'offline retry uses original history');
select is((public.get_exercise_deep_analytics('14000000-0000-4000-8000-000000000002')
  ->'cardio'->>'total_distance_km')::numeric, 1.25::numeric, 'analytics counts GPS distance once');
select is((public.get_exercise_deep_analytics('14000000-0000-4000-8000-000000000002')
  ->'cardio'->>'average_pace_seconds_per_km')::numeric, 300::numeric, 'analytics preserves active pace');

insert into public.cardio_recordings(id, user_id, workout_history_id, started_at)
values ('14000000-0000-4000-8000-000000000003', auth.uid(), pg_temp.save_run(), now() - interval '375 seconds');
select lives_ok($$
  insert into public.cardio_route_points(recording_id,point_index,recorded_at,latitude,longitude,elapsed_seconds,leg_index,active_ms,cumulative_meters)
  values ('14000000-0000-4000-8000-000000000003',0,now(),0,0,0,1,0,0),
         ('14000000-0000-4000-8000-000000000003',0,now(),0,0,0,1,0,0)
  on conflict(recording_id,point_index) do nothing
$$, 'private GPS batch is retryable with the owner grants');
select is((select count(*) from public.cardio_route_points
  where recording_id='14000000-0000-4000-8000-000000000003'), 1::bigint,'duplicate point is ignored');
select throws_ok($$
  insert into public.cardio_route_points(recording_id,point_index,recorded_at,latitude,longitude,elapsed_seconds,leg_index,active_ms,cumulative_meters)
  values ('14000000-0000-4000-8000-000000000003',1,now(),0,0,0,-1,0,0)
$$,'23514',null,'invalid segment is rejected');
select * from finish();
rollback;

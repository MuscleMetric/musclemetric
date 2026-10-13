begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id,email) values
 ('a1000000-0000-4000-8000-000000000001','save-owner-a@test.local'),
 ('b1000000-0000-4000-8000-000000000002','save-owner-b@test.local');
insert into public.profiles (id,name,email) values
 ('a1000000-0000-4000-8000-000000000001','Owner A','save-owner-a@test.local'),
 ('b1000000-0000-4000-8000-000000000002','Owner B','save-owner-b@test.local');

set local role authenticated;
set local request.jwt.claim.sub='a1000000-0000-4000-8000-000000000001';

select lives_ok(
 $$
 select public.save_completed_workout_v2(
   '{"client_save_id":"a2000000-0000-4000-8000-000000000001",
      "workout_id":null, "completed_at":"2026-10-13T12:00:00Z",
      "duration_seconds":30, "exercise_history":[],
      "workout_exercise_updates":[]}'::jsonb,
   'a1000000-0000-4000-8000-000000000001'::uuid)
 $$,
 'v2 accepts a workout matching the current authenticated owner'
);
select is(
 (select count(*) from public.workout_history
  where client_save_id='a2000000-0000-4000-8000-000000000001'),
 1::bigint,'v2 writes one workout for the expected owner'
);
select is(
 public.save_completed_workout_v2(
   '{"client_save_id":"a2000000-0000-4000-8000-000000000001",
      "workout_id":null, "completed_at":"2026-10-13T12:00:00Z",
      "duration_seconds":30, "exercise_history":[],
      "workout_exercise_updates":[]}'::jsonb,
   'a1000000-0000-4000-8000-000000000001'::uuid),
 (select id from public.workout_history
  where client_save_id='a2000000-0000-4000-8000-000000000001'),
 'same client_save_id returns existing history'
);
select is(
 (select count(*) from public.workout_history
  where client_save_id='a2000000-0000-4000-8000-000000000001'),
 1::bigint,'v2 retry creates no duplicate history'
);

-- Simulates the device switching from owner A to B after enqueue or after
-- opening the save-confirmation dialog but before the RPC gets its JWT.
set local request.jwt.claim.sub='b1000000-0000-4000-8000-000000000002';
select throws_ok(
 $$
 select public.save_completed_workout_v2(
   '{"client_save_id":"a2000000-0000-4000-8000-000000000002",
      "workout_id":null, "completed_at":"2026-10-13T12:01:00Z",
      "duration_seconds":30, "exercise_history":[],
      "workout_exercise_updates":[]}'::jsonb,
   'a1000000-0000-4000-8000-000000000001'::uuid)
 $$,
 '42501','workout_owner_mismatch',
 'server rejects an owner-A workout sent under owner-B authentication'
);
select is(
 (select count(*) from public.workout_history
  where client_save_id='a2000000-0000-4000-8000-000000000002'),
 0::bigint,'rejected cross-account save writes no history'
);

select throws_ok(
 $$
 select public.save_completed_workout_v2(
   '{"client_save_id":"b2000000-0000-4000-8000-000000000001",
      "workout_id":null, "completed_at":"2026-10-13T12:03:00Z",
      "duration_seconds":30, "exercise_history":[],
      "workout_exercise_updates":[]}'::jsonb,
   null::uuid)
 $$,
 '42501','workout_owner_mismatch',
 'null expected owner is rejected rather than falling back to current user'
);
select lives_ok(
 $$
 select public.save_completed_workout_v2(
   '{"client_save_id":"b2000000-0000-4000-8000-000000000002",
      "workout_id":null, "completed_at":"2026-10-13T12:04:00Z",
      "duration_seconds":30, "exercise_history":[],
      "workout_exercise_updates":[]}'::jsonb,
   'b1000000-0000-4000-8000-000000000002'::uuid)
 $$,
 'user B can save B-owned workouts'
);
select is(
 (select user_id from public.workout_history
  where client_save_id='b2000000-0000-4000-8000-000000000002'),
 'b1000000-0000-4000-8000-000000000002'::uuid,
 'accepted workout belongs to the signed-in user B'
);

set local role postgres;
select is(
 has_function_privilege('anon', 'public.save_completed_workout_v2(jsonb,uuid)', 'EXECUTE'),
 false, 'anonymous role cannot execute the owner-checked save endpoint'
);

select * from finish();
rollback;

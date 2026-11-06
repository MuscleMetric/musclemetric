begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Named fixture IDs keep the selection scenarios readable.
create function pg_temp.fixture_id(text) returns uuid language sql immutable
as $$ select md5($1)::uuid $$;

insert into auth.users(id,email)
select pg_temp.fixture_id(u), u || '@history.test' from unnest(array['owner','other']) u;
insert into public.profiles(id,name,email)
select pg_temp.fixture_id(u), u, u || '@history.test' from unnest(array['owner','other']) u;
insert into public.exercises(id,name,type,is_public) values
 (pg_temp.fixture_id('bench'),'Bench','strength',true),
 (pg_temp.fixture_id('row'),'Row','strength',true);
insert into public.workouts(id,user_id,title)
select pg_temp.fixture_id(w), pg_temp.fixture_id('owner'), w from unnest(array['Upper A','Upper B','New']) w;
insert into public.workout_exercises(workout_id,exercise_id,order_index)
select pg_temp.fixture_id(w), pg_temp.fixture_id('bench'), 0 from unnest(array['Upper A','New']) w;
insert into public.workout_history(id,user_id,workout_id,completed_at)
select pg_temp.fixture_id(session),pg_temp.fixture_id(owner),pg_temp.fixture_id(template),day::timestamptz
from (values ('Monday','owner','Upper A','2026-11-02'), ('Tuesday','owner','Upper B','2026-11-03'),
             ('Wednesday','owner',null,'2026-11-04'), ('Skipped','owner','Upper A','2026-11-05'),
             ('Other user','other',null,'2026-11-06')) x(session,owner,template,day);
insert into public.workout_exercise_history(id,workout_history_id,exercise_id,order_index)
select pg_temp.fixture_id(s || ' bench'), pg_temp.fixture_id(s), pg_temp.fixture_id('bench'), 0
from unnest(array['Monday','Tuesday','Wednesday','Skipped','Other user']) s;
insert into public.workout_set_history(workout_exercise_history_id,set_number,drop_index,reps,weight)
select pg_temp.fixture_id(s || ' bench'), n, d, reps, weight
from (values ('Monday',1,1,5,80), ('Monday',1,0,8,100), ('Tuesday',1,0,6,105),
             ('Wednesday',1,0,4,110), ('Other user',1,0,1,200)) x(s,n,d,reps,weight);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture_id('owner')::text,true);
select is(public.get_workout_session_bootstrap(pg_temp.fixture_id('Upper A')) #>> '{exercises,0,lastSession,sets,0,weight}',
          '100.00','saved workout prefers its own latest logged session, skipping empty rows');
select is(public.get_workout_session_bootstrap(pg_temp.fixture_id('Upper A')) #>> '{exercises,0,lastSession,sets,1,dropIndex}',
          '1','drop sets follow their base set');
select is(public.get_workout_session_bootstrap(pg_temp.fixture_id('New')) #>> '{exercises,0,lastSession,sets,0,weight}',
          '110.00','new template falls back to latest exercise session including Quick Start');
select is((select last_session #>> '{sets,0,weight}' from public.get_last_exercise_sessions(array[pg_temp.fixture_id('bench')])),
          '110.00','add and swap ignore template preference and other accounts');
select is((select count(*) from public.get_last_exercise_sessions(array[pg_temp.fixture_id('bench'),pg_temp.fixture_id('row')])),
          2::bigint,'multi-add returns one result per exercise');
select is((select last_session from public.get_last_exercise_sessions(array[pg_temp.fixture_id('row')])),
          '{"completedAt":null,"sets":[]}'::jsonb,'never-logged exercise has empty history');
select is((select count(*) from public.get_last_exercise_sessions(array[pg_temp.fixture_id('bench')],null,pg_temp.fixture_id('other'))),
          0::bigint,'stale account request receives no rows');
select ok(not has_function_privilege('anon','public.get_last_exercise_sessions(uuid[],uuid,uuid)','execute'),
          'anonymous users cannot call the lookup');
select * from finish();
rollback;

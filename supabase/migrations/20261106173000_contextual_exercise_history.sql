-- Each requested exercise gets one reference session. A template match wins
-- over a newer session elsewhere; null preference means newest anywhere.
create or replace function public.get_last_exercise_sessions(
  p_exercise_ids uuid[],
  p_preferred_workout_id uuid default null,
  p_expected_user_id uuid default auth.uid()
)
returns table (exercise_id uuid, last_session jsonb)
language sql stable security invoker set search_path = ''
as $$
  with requested as (
    select distinct id from unnest(p_exercise_ids) as ids(id)
    where id is not null and p_expected_user_id = (select auth.uid())
  ),
  recorded as not materialized (
    select e.exercise_id, h.id as session_id, h.completed_at, h.workout_id,
           e.order_index, e.id as entry_id, s.*
    from public.workout_history h
    join public.workout_exercise_history e on e.workout_history_id = h.id
    join public.workout_set_history s on s.workout_exercise_history_id = e.id
    where h.user_id = (select auth.uid()) and h.completed_at is not null
      and (s.reps > 0 or s.weight > 0 or s.distance > 0 or s.time_seconds > 0)
  ),
  latest as (
    select distinct on (r.exercise_id) r.exercise_id, r.session_id, r.completed_at
    from recorded r join requested q on q.id = r.exercise_id
    order by r.exercise_id, coalesce(r.workout_id = p_preferred_workout_id, false) desc,
             r.completed_at desc, r.session_id desc
  )
  select q.id, jsonb_build_object(
    'completedAt', l.completed_at,
    'sets', coalesce(jsonb_agg(jsonb_build_object(
      'setNumber', r.set_number, 'dropIndex', r.drop_index, 'weight', r.weight,
      'reps', r.reps, 'timeSeconds', r.time_seconds, 'distance', r.distance, 'notes', r.notes
    ) order by r.order_index, r.entry_id, r.set_number, r.drop_index, r.id)
    filter (where r.id is not null), '[]'::jsonb)
  )
  from requested q
  left join latest l on l.exercise_id = q.id
  left join recorded r on r.exercise_id = q.id and r.session_id = l.session_id
  group by q.id, l.completed_at;
$$;

revoke all on function public.get_last_exercise_sessions(uuid[],uuid,uuid) from public, anon;
grant execute on function public.get_last_exercise_sessions(uuid[],uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.get_workout_session_bootstrap(p_workout_id uuid, p_plan_workout_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with me as (
  select auth.uid() as user_id
),

-- validate workout ownership
w as (
  select
    wo.id,
    wo.user_id,
    wo.title,
    wo.notes,
    wo.workout_image_key
  from public.workouts wo
  join me on me.user_id = wo.user_id
  where wo.id = p_workout_id
),

-- validate plan workout (optional) belongs to me
pw as (
  select
    pww.id as plan_workout_id,
    pww.plan_id,
    pww.workout_id,
    pww.title as plan_workout_title,
    pww.order_index
  from public.plan_workouts pww
  join public.plans p on p.id = pww.plan_id
  join me on me.user_id = p.user_id
  where p_plan_workout_id is not null
    and pww.id = p_plan_workout_id
),

-- base exercise list for this workout (ignore archived workout_exercises)
wx as (
  select
    we.id as workout_exercise_id,
    we.workout_id,
    we.exercise_id,
    we.order_index,
    we.target_sets,
    we.target_reps,
    we.target_weight,
    we.target_time_seconds,
    we.target_distance,
    we.notes as workout_exercise_notes,
    we.superset_group,
    we.superset_index,
    we.is_dropset
  from public.workout_exercises we
  join w on w.id = we.workout_id
  where we.is_archived = false
),

-- join exercise metadata
ex as (
  select
    wx.*,
    e.name,
    e.equipment,
    e.type,
    e.level,
    e.video_url,
    e.instructions
  from wx
  join public.exercises e on e.id = wx.exercise_id
),

-- history for THIS workout only
hist_workouts as (
  select
    wh.id as workout_history_id,
    wh.completed_at,
    wh.duration_seconds
  from public.workout_history wh
  join me on me.user_id = wh.user_id
  where wh.workout_id = p_workout_id
),

-- workout-level last completion
last_workout as (
  select max(completed_at) as last_completed_at
  from hist_workouts
),

-- total volume per workout_history_id (sum reps*weight)
hist_volume as (
  select
    hw.workout_history_id,
    sum(coalesce(wsh.reps,0) * coalesce(wsh.weight,0))::numeric as total_volume
  from hist_workouts hw
  join public.workout_exercise_history weh
    on weh.workout_history_id = hw.workout_history_id
  join public.workout_set_history wsh
    on wsh.workout_exercise_history_id = weh.id
  group by hw.workout_history_id
),

header_stats as (
  select
    round(avg(hw.duration_seconds)::numeric, 0)::int as avg_duration_seconds,
    round(avg(hv.total_volume)::numeric, 0)::numeric as avg_total_volume
  from hist_workouts hw
  left join hist_volume hv
    on hv.workout_history_id = hw.workout_history_id
),

-- goals: only if this is a plan workout -> use plan_id; filter to exercises in this workout (or exercise_id null)
g as (
  select
    g.id,
    g.type,
    g.target_number,
    g.unit,
    g.deadline,
    g.exercise_id,
    g.notes
  from public.goals g
  join me on me.user_id = g.user_id
  join pw on pw.plan_id = g.plan_id
  where g.is_active = true
    and (
      g.exercise_id is null
      or g.exercise_id in (select exercise_id from ex)
    )
),

-- ---------------------------
-- Today’s goal (per-session target for exercise_weight goals)
-- ---------------------------

pr as (
  select
    p.id,
    coalesce(p.timezone, 'UTC') as timezone
  from public.profiles p
  join me on me.user_id = p.id
),

pl as (
  select
    pl.id as plan_id,
    pl.start_date,
    pl.end_date
  from public.plans pl
  join pw on pw.plan_id = pl.id
),

plan_calendar as (
  select
    greatest(
      1,
      ceil(((pl.end_date - pl.start_date + 1)::numeric) / 7)::int
    ) as total_weeks,

    greatest(
      1,
      least(
        ( (((now() at time zone (select timezone from pr))::date - pl.start_date) / 7) + 1 )::int,
        greatest(1, ceil(((pl.end_date - pl.start_date + 1)::numeric) / 7)::int)
      )
    ) as current_week
  from pl
),

g_weight as (
  select
    g.id as goal_id,
    g.exercise_id,
    g.target_number::numeric as goal_weight,
    coalesce(nullif(g.unit,''), 'kg') as unit,
    g.notes
  from g
  where g.exercise_id is not null
    and g.type::text = 'exercise_weight'
),

-- Which plan workouts include this goal exercise?
plan_exercise_occurrences as (
  select
    gw.goal_id,
    gw.exercise_id,
    pw2.id as plan_workout_id,
    pw2.order_index,
    pw2.workout_id
  from g_weight gw
  join public.plan_workouts pw2
    on pw2.plan_id = (select plan_id from pw)
   and pw2.is_archived = false
  join public.workout_exercises we2
    on we2.workout_id = pw2.workout_id
   and we2.is_archived = false
   and we2.exercise_id = gw.exercise_id
),

exercise_schedule_stats as (
  select
    x.goal_id,
    x.exercise_id,
    count(*)::int as sessions_per_week,
    max(
      case
        when x.plan_workout_id = (select plan_workout_id from pw)
        then x.rn
        else null
      end
    )::int as occurrence_in_week
  from (
    select
      peo.*,
      row_number() over (
        partition by peo.goal_id
        order by peo.order_index asc nulls last, peo.plan_workout_id
      ) as rn
    from plan_exercise_occurrences peo
  ) x
  group by x.goal_id, x.exercise_id
),

-- Parse {"start": 20} from notes if present
goal_notes_start as (
  select
    gw.goal_id,
    nullif(
      (regexp_match(coalesce(gw.notes,''), '\"start\"\s*:\s*([0-9]+(\.[0-9]+)?)'))[1],
      ''
    )::numeric as start_weight_from_notes
  from g_weight gw
),

-- last pre-plan session per exercise (across ALL workouts)
preplan_last_session as (
  select distinct on (weh.exercise_id)
    weh.exercise_id,
    wh.id as workout_history_id,
    wh.completed_at
  from public.workout_exercise_history weh
  join public.workout_history wh on wh.id = weh.workout_history_id
  join me on me.user_id = wh.user_id
  where weh.exercise_id in (select exercise_id from g_weight)
    and (select start_date from pl) is not null
    and (wh.completed_at at time zone (select timezone from pr))::date < (select start_date from pl)
  order by weh.exercise_id, wh.completed_at desc
),

preplan_baseline_weight as (
  select
    p.exercise_id,
    max(wsh.weight)::numeric as start_weight
  from preplan_last_session p
  join public.workout_exercise_history weh
    on weh.exercise_id = p.exercise_id
   and weh.workout_history_id = p.workout_history_id
  join public.workout_set_history wsh
    on wsh.workout_exercise_history_id = weh.id
  where wsh.weight is not null
  group by p.exercise_id
),

-- fallback baseline from THIS workout prescription
workout_prescription_baseline as (
  select
    ex.exercise_id,
    max(ex.target_weight)::numeric as start_weight
  from ex
  where ex.target_weight is not null
  group by ex.exercise_id
),

todays_goals as (
  select
    gw.goal_id,
    gw.exercise_id,
    e.name as exercise_name,
    gw.unit,

    coalesce(
      (select start_weight_from_notes from goal_notes_start ns where ns.goal_id = gw.goal_id),
      (select start_weight from preplan_baseline_weight pb where pb.exercise_id = gw.exercise_id),
      (select start_weight from workout_prescription_baseline wb where wb.exercise_id = gw.exercise_id),
      0::numeric
    ) as start_weight,

    gw.goal_weight,

    greatest(1, coalesce(ss.sessions_per_week, 1)) as sessions_per_week,

    ((select total_weeks from plan_calendar) * greatest(1, coalesce(ss.sessions_per_week, 1)))::int as total_sessions,

    (
      ((select current_week from plan_calendar) - 1) * greatest(1, coalesce(ss.sessions_per_week, 1))
      + greatest(1, coalesce(ss.occurrence_in_week, 1))
    )::int as session_number,

    case
      when ((select total_weeks from plan_calendar) * greatest(1, coalesce(ss.sessions_per_week, 1))) <= 1
        then gw.goal_weight
      else
        (
          coalesce(
            (select start_weight_from_notes from goal_notes_start ns where ns.goal_id = gw.goal_id),
            (select start_weight from preplan_baseline_weight pb where pb.exercise_id = gw.exercise_id),
            (select start_weight from workout_prescription_baseline wb where wb.exercise_id = gw.exercise_id),
            0::numeric
          )
          +
          (
            (gw.goal_weight - coalesce(
              (select start_weight_from_notes from goal_notes_start ns where ns.goal_id = gw.goal_id),
              (select start_weight from preplan_baseline_weight pb where pb.exercise_id = gw.exercise_id),
              (select start_weight from workout_prescription_baseline wb where wb.exercise_id = gw.exercise_id),
              0::numeric
            ))
            *
            (
              (
                (
                  (
                    ((select current_week from plan_calendar) - 1) * greatest(1, coalesce(ss.sessions_per_week, 1))
                    + greatest(1, coalesce(ss.occurrence_in_week, 1))
                  )::numeric - 1
                )
                /
                nullif(
                  (((select total_weeks from plan_calendar) * greatest(1, coalesce(ss.sessions_per_week, 1)) - 1))::numeric,
                  0
                )
              )
            )
          )
        )
    end as target_this_session
  from g_weight gw
  join public.exercises e on e.id = gw.exercise_id
  left join exercise_schedule_stats ss
    on ss.goal_id = gw.goal_id
   and ss.exercise_id = gw.exercise_id
),

-- Shared with the live add/swap paths.
last_sessions as materialized (
  select * from public.get_last_exercise_sessions(
    array(select exercise_id from ex), p_workout_id
  )
),

-- best e1rm per exercise (LAST 6 MONTHS across ALL workouts)
e1rm_6m_sets as (
  select
    weh.exercise_id,
    wh.completed_at,
    wsh.weight,
    wsh.reps,
    (wsh.weight * (1 + (wsh.reps::numeric / 30.0))) as e1rm
  from public.workout_exercise_history weh
  join public.workout_history wh on wh.id = weh.workout_history_id
  join me on me.user_id = wh.user_id
  join public.workout_set_history wsh on wsh.workout_exercise_history_id = weh.id
  where weh.exercise_id in (select exercise_id from ex)
    and wh.completed_at >= (now() - interval '6 months')
    and wsh.weight is not null
    and wsh.reps is not null
    and wsh.reps > 0
),

best_e1rm_6m as (
  select
    exercise_id,
    max(e1rm) as best_e1rm_6m
  from e1rm_6m_sets
  group by exercise_id
),

best_set_6m as (
  select distinct on (exercise_id)
    exercise_id,
    completed_at,
    weight,
    reps,
    e1rm
  from e1rm_6m_sets
  order by exercise_id, e1rm desc, completed_at desc
),

-- volume per exercise (within THIS workout only)
exercise_volume as (
  select
    weh.exercise_id,
    sum(coalesce(wsh.reps,0) * coalesce(wsh.weight,0))::numeric as total_volume_all_time
  from public.workout_exercise_history weh
  join public.workout_history wh on wh.id = weh.workout_history_id
  join me on me.user_id = wh.user_id
  join public.workout_set_history wsh on wsh.workout_exercise_history_id = weh.id
  where weh.exercise_id in (select exercise_id from ex)
    and wh.workout_id = p_workout_id
  group by weh.exercise_id
)

select jsonb_build_object(
  'workout',
    jsonb_build_object(
      'workoutId', w.id,
      'title', w.title,
      'notes', w.notes,
      'imageKey', w.workout_image_key,
      'isPlanWorkout', (p_plan_workout_id is not null),
      'planWorkoutId', (select plan_workout_id from pw),
      'lastCompletedAt', (select last_completed_at from last_workout)
    ),

  'headerStats',
    jsonb_build_object(
      'avgDurationSeconds', (select avg_duration_seconds from header_stats),
      'avgTotalVolume', (select avg_total_volume from header_stats)
    ),

  -- keep your existing goals array
  'goals',
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'type', g.type,
          'targetNumber', g.target_number,
          'unit', g.unit,
          'deadline', g.deadline,
          'exerciseId', g.exercise_id,
          'notes', g.notes
        )
      ) from g),
      '[]'::jsonb
    ),

  -- ✅ new, purpose-built payload for the "Today’s goal" UI
  'todaysGoals',
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'goalId', tg.goal_id,
          'exerciseId', tg.exercise_id,
          'exerciseName', tg.exercise_name,
          'unit', tg.unit,
          'startWeight', tg.start_weight,
          'goalWeight', tg.goal_weight,
          'sessionsPerWeek', tg.sessions_per_week,
          'sessionNumber', tg.session_number,
          'totalSessions', tg.total_sessions,
          'targetThisSession', tg.target_this_session
        )
        order by tg.exercise_name asc
      ) from todays_goals tg),
      '[]'::jsonb
    ),

  'exercises',
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'workoutExerciseId', ex.workout_exercise_id,
          'exerciseId', ex.exercise_id,
          'orderIndex', ex.order_index,

          'name', ex.name,
          'equipment', ex.equipment,
          'type', ex.type,
          'level', ex.level,
          'videoUrl', ex.video_url,
          'instructions', ex.instructions,

          'prescription', jsonb_build_object(
            'targetSets', ex.target_sets,
            'targetReps', ex.target_reps,
            'targetWeight', ex.target_weight,
            'targetTimeSeconds', ex.target_time_seconds,
            'targetDistance', ex.target_distance,
            'notes', ex.workout_exercise_notes,
            'supersetGroup', ex.superset_group,
            'supersetIndex', ex.superset_index,
            'isDropset', ex.is_dropset
          ),

          'lastSession', (select last_session from last_sessions ls where ls.exercise_id = ex.exercise_id),

          'bestE1rm6m', (select best_e1rm_6m from best_e1rm_6m b where b.exercise_id = ex.exercise_id),

          'bestSet6m', jsonb_build_object(
            'completedAt', (select completed_at from best_set_6m s where s.exercise_id = ex.exercise_id),
            'weight', (select weight from best_set_6m s where s.exercise_id = ex.exercise_id),
            'reps', (select reps from best_set_6m s where s.exercise_id = ex.exercise_id),
            'e1rm', (select e1rm from best_set_6m s where s.exercise_id = ex.exercise_id)
          ),

          'totalVolumeAllTime', (select total_volume_all_time from exercise_volume v where v.exercise_id = ex.exercise_id)
        )
        order by ex.order_index asc
      ) from ex),
      '[]'::jsonb
    )
)
from w;
$function$;

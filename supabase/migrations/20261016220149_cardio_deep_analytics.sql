-- Preserve the strength payload for existing clients; add an owner-scoped cardio section.
CREATE OR REPLACE FUNCTION public.get_exercise_deep_analytics(p_exercise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_timezone text := 'UTC';
  v_now timestamptz := now();

  v_exercise_name text := null;
  v_exercise_type text;
  v_cardio jsonb;
  v_payload jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Premium gate
  perform public.assert_can_view_deep_analytics(v_user_id);

  select coalesce(p.timezone, 'UTC')
    into v_timezone
  from public.profiles p
  where p.id = v_user_id;

  select e.name, coalesce(e.type, 'strength')
    into v_exercise_name, v_exercise_type
  from public.exercises e
  where e.id = p_exercise_id;

  with
  sets as (
    select
      wh.id as workout_history_id,
      wh.completed_at,
      weh.id as weh_id,
      wsh.id as set_id,
      wsh.set_number,
      wsh.reps::int as reps,
      wsh.weight::numeric as weight_kg,
      (wsh.weight * wsh.reps)::numeric as volume,
      (wsh.weight * (1 + (wsh.reps::numeric / 30.0)))::numeric as e1rm
    from public.workout_history wh
    join public.workout_exercise_history weh
      on weh.workout_history_id = wh.id
    join public.workout_set_history wsh
      on wsh.workout_exercise_history_id = weh.id
    where wh.user_id = v_user_id
      and weh.exercise_id = p_exercise_id
      and wh.completed_at >= v_now - interval '365 days'
      and wsh.weight is not null and wsh.weight > 0
      and wsh.reps is not null and wsh.reps > 0
  ),

  latest_session as (
    select
      workout_history_id,
      max(completed_at) as completed_at
    from sets
    group by workout_history_id
    order by max(completed_at) desc
    limit 1
  ),
  latest_session_sets as (
    select s.*
    from sets s
    join latest_session ls using (workout_history_id)
    order by s.set_number asc, s.set_id asc
  ),

  current_card as (
    select
      case
        when (select count(*) from latest_session) = 0 then null
        else jsonb_build_object(
          'completed_at', (select completed_at from latest_session),
          'top_weight', coalesce((select max(weight_kg) from latest_session_sets), 0),
          'top_set',
            (select jsonb_build_object(
              'weight_kg', round(weight_kg, 1),
              'reps', reps,
              'e1rm', round(e1rm, 1)
            )
            from latest_session_sets
            order by e1rm desc, weight_kg desc, reps desc
            limit 1)
        )
      end as j
  ),

  best_set as (
    select *
    from sets
    order by e1rm desc, weight_kg desc, reps desc, completed_at desc
    limit 1
  ),
  best_card as (
    select
      case
        when (select count(*) from best_set) = 0 then null
        else jsonb_build_object(
          'e1rm', round((select e1rm from best_set), 1),
          'weight_kg', round((select weight_kg from best_set), 1),
          'reps', (select reps from best_set),
          'completed_at', (select completed_at from best_set)
        )
      end as j
  ),

  vol_by_session as (
    select
      workout_history_id,
      max(completed_at) as completed_at,
      sum(volume)::numeric as volume
    from sets
    group by workout_history_id
    order by max(completed_at) desc
    limit 6
  ),
  vol_trend as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char((completed_at at time zone v_timezone)::date, 'YYYY-MM-DD'),
          'volume', round(volume, 0)
        )
        order by completed_at asc
      ),
      '[]'::jsonb
    ) as j
    from (select * from vol_by_session order by completed_at asc) x
  ),

  scatter as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'reps', reps,
          'weight_kg', round(weight_kg, 1),
          'e1rm', round(e1rm, 1),
          'completed_at', completed_at
        )
        order by completed_at desc, set_id desc
      ),
      '[]'::jsonb
    ) as j
    from (select * from sets order by completed_at desc, set_id desc limit 30) x
  ),

  contrib as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'set_id', set_id,
          'set_number', set_number,
          'volume', round(volume, 0),
          'weight_kg', round(weight_kg, 1),
          'reps', reps
        )
        order by set_number asc, set_id asc
      ),
      '[]'::jsonb
    ) as j
    from latest_session_sets
  ),

  strength_by_session as (
    select
      workout_history_id,
      max(completed_at) as completed_at,
      max(weight_kg) as top_weight,
      max(e1rm) as top_e1rm
    from sets
    group by workout_history_id
    order by max(completed_at) desc
    limit 12
  ),
  strength_over_time as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char((completed_at at time zone v_timezone)::date, 'YYYY-MM-DD'),
          'top_weight', round(top_weight, 1),
          'top_e1rm', round(top_e1rm, 1)
        )
        order by completed_at asc
      ),
      '[]'::jsonb
    ) as j
    from (select * from strength_by_session order by completed_at asc) x
  )

  select jsonb_build_object(
    'meta', jsonb_build_object(
      'exercise_id', p_exercise_id,
      'exercise_name', coalesce(v_exercise_name, ''),
      'generated_at', v_now,
      'timezone', v_timezone,
      'unit', 'kg'
    ),
    'cards', jsonb_build_object(
      'current', (select j from current_card),
      'best_set', (select j from best_card),
      'est_1rm', jsonb_build_object(
        'value', coalesce((select round(e1rm, 1) from best_set), 0)
      )
    ),
    'charts', jsonb_build_object(
      'volume_trend', (select j from vol_trend),
      'weight_vs_reps', (select j from scatter),
      'set_contribution', (select j from contrib),
      'strength_over_time', (select j from strength_over_time)
    )
  )
  into v_payload;

  v_payload := jsonb_set(v_payload, '{meta,exercise_type}', to_jsonb(coalesce(v_exercise_type, 'strength')));
  if v_exercise_type = 'cardio' then
    with logged as (
      select wh.id as session_id, wh.completed_at,
        wsh.distance, wsh.time_seconds
      from public.workout_history wh
      join public.workout_exercise_history weh on weh.workout_history_id = wh.id
      join public.workout_set_history wsh on wsh.workout_exercise_history_id = weh.id
      where wh.user_id = v_user_id and weh.exercise_id = p_exercise_id
        and wh.completed_at >= v_now - interval '365 days'
        and (wsh.distance > 0 or wsh.time_seconds > 0)
    ), sessions as (
      select session_id, completed_at,
        sum(distance) filter (where distance > 0) as distance_km,
        sum(time_seconds) filter (where time_seconds > 0) as duration_seconds,
        sum(distance) filter (where distance > 0 and time_seconds > 0) as paired_distance,
        sum(time_seconds) filter (where distance > 0 and time_seconds > 0) as paired_time,
        sum(time_seconds) filter (where distance > 0 and time_seconds > 0)::numeric /
          nullif(sum(distance) filter (where distance > 0 and time_seconds > 0),0) as pace_seconds_per_km
      from logged group by session_id, completed_at
    ), recent as (
      select * from sessions order by completed_at desc, session_id desc limit 12
    )
    select jsonb_build_object(
      'session_count', count(*),
      'total_distance_km', coalesce(sum(distance_km),0),
      'total_duration_seconds', coalesce(sum(duration_seconds),0),
      'longest_distance_km', max(distance_km),
      'average_pace_seconds_per_km', sum(paired_time)::numeric / nullif(sum(paired_distance),0),
      'latest', (select jsonb_build_object(
        'session_id',session_id,'completed_at',completed_at,
        'distance_km',distance_km,'duration_seconds',duration_seconds,
        'pace_seconds_per_km',pace_seconds_per_km)
        from recent order by completed_at desc, session_id desc limit 1),
      'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
        'session_id',session_id,'completed_at',completed_at,
        'distance_km',distance_km,'duration_seconds',duration_seconds,
        'pace_seconds_per_km',pace_seconds_per_km)
        order by completed_at, session_id),'[]'::jsonb) from recent)
    ) into v_cardio from sessions;
    v_payload := v_payload || jsonb_build_object('cardio', v_cardio);
  end if;

  return v_payload;
end;
$function$;

-- Keep the original last-session endpoint available to earlier clients.
create function public.get_live_exercise_history_stats(
  p_exercise_ids uuid[], p_preferred_workout_id uuid default null,
  p_expected_user_id uuid default auth.uid()
)
returns table (exercise_id uuid, last_session jsonb, best_set_6m jsonb)
language sql stable security invoker set search_path = ''
as $$
  select previous.exercise_id, previous.last_session,
         case when best.e1rm is not null then jsonb_build_object(
           'completedAt', best.completed_at, 'weight', best.weight,
           'reps', best.reps, 'e1rm', best.e1rm
         ) end
  from public.get_last_exercise_sessions(p_exercise_ids, p_preferred_workout_id, p_expected_user_id) previous
  left join lateral (
    select h.completed_at, s.weight, s.reps,
           s.weight * (1 + s.reps::numeric / 30) as e1rm
    from public.workout_history h
    join public.workout_exercise_history e on e.workout_history_id = h.id
    join public.workout_set_history s on s.workout_exercise_history_id = e.id
    where h.user_id = (select auth.uid()) and e.exercise_id = previous.exercise_id
      and h.completed_at between now() - interval '6 months' and now()
      and s.weight > 0 and s.reps > 0
    order by e1rm desc, h.completed_at desc, s.id
    limit 1
  ) best on true;
$$;
revoke all on function public.get_live_exercise_history_stats(uuid[],uuid,uuid) from public, anon;
grant execute on function public.get_live_exercise_history_stats(uuid[],uuid,uuid) to authenticated;

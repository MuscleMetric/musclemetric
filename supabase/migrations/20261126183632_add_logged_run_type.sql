alter table public.workout_exercise_history
  add column run_type text check (run_type in ('easy', 'tempo', 'intervals', 'long_run', 'race'));

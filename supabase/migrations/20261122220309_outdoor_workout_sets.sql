-- Standalone recordings have a NULL slot. Each recorded exercise set in a
-- structured workout has a distinct slot under the same history / owner FK.
alter table public.cardio_recordings
  add column workout_slot text check (length(workout_slot) between 1 and 100),
  drop constraint cardio_recordings_workout_history_id_key,
  drop constraint cardio_recordings_completion_check,
  add constraint cardio_recordings_completion_check check (
    (status = 'completed' and (run_type is not null or workout_slot is not null)
      and completed_at is not null and completed_at >= started_at)
    or (status <> 'completed' and completed_at is null)
  );
create unique index cardio_standalone_history_idx on public.cardio_recordings(workout_history_id)
  where workout_slot is null;
create unique index cardio_workout_slot_idx on public.cardio_recordings(workout_history_id, workout_slot)
  where workout_slot is not null;

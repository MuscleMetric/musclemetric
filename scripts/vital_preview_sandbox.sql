-- Read-only safety rehearsal. This creates only a session-scoped temp table.
-- No persistent writes: the transaction is always rolled back.
BEGIN;
CREATE TEMP TABLE vital_preview_exercises ON COMMIT DROP AS
SELECT id, name, equipment, type
FROM public.exercises WHERE user_id IS NULL
ORDER BY name LIMIT 8;
SELECT
  (SELECT count(*) FROM vital_preview_exercises) AS temporary_rows,
  (SELECT count(*) FROM public.exercises) AS production_exercise_rows,
  (SELECT count(*) FROM public.exercise_muscles) AS production_muscle_links,
  (SELECT count(*) FROM public.workout_exercise_history) AS production_history_exercise_rows;
ROLLBACK;

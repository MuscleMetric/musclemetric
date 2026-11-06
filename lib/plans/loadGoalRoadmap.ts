import { supabase } from "@/lib/supabase";
import type {
  GoalRow,
  PlanRow,
  PlanWorkoutRow,
  WorkoutExerciseRow,
} from "./goalRoadmap";

// Older single-metric goals keep their start in notes and their target in target_number.
function normalizeGoal(goal: GoalRow): GoalRow {
  if (goal.metrics?.length) return goal;
  const metric =
    goal.type === "exercise_weight"
      ? "weight"
      : goal.type === "exercise_reps"
        ? "reps"
        : null;
  if (!metric) return goal;
  let start = goal[`start_${metric}`];
  if (start == null && goal.notes) {
    try {
      start = Number(JSON.parse(goal.notes)?.start);
    } catch {
      /* Optional legacy notes. */
    }
  }
  return {
    ...goal,
    metrics: [metric],
    [`start_${metric}`]: start,
    [`target_${metric}`]: goal[`target_${metric}`] ?? goal.target_number,
  };
}

export async function loadGoalRoadmap(planId: string) {
  const [planRes, goalsRes, planWorkoutsRes] = await Promise.all([
    supabase
      .from("plans")
      .select("id,title,start_date,end_date")
      .eq("id", planId)
      .maybeSingle(),

    supabase
      .from("goals")
      .select(
        `
        id,
        exercise_id,
        metrics, type, target_number, notes,
        goal_summary,
        start_weight,
        start_reps,
        start_distance,
        start_time_seconds,
        target_weight,
        target_reps,
        target_distance,
        target_time_seconds,
        exercises:exercise_id(name)
      `,
      )
      .eq("plan_id", planId)
      .eq("is_active", true)
      .order("created_at")
      .order("id"),

    supabase
      .from("plan_workouts")
      .select("id,title,order_index,workout_id")
      .eq("plan_id", planId)
      .eq("is_archived", false)
      .order("order_index", { ascending: true })
      .order("id"),
  ]);

  for (const result of [planRes, goalsRes, planWorkoutsRes]) {
    if (result.error) throw result.error;
  }

  const loadedPlanWorkouts = (planWorkoutsRes.data ?? []) as PlanWorkoutRow[];

  const workoutIds = loadedPlanWorkouts.map((w) => w.workout_id);

  let exerciseRows: WorkoutExerciseRow[] = [];

  if (workoutIds.length > 0) {
    const workoutExercisesRes = await supabase
      .from("workout_exercises")
      .select("workout_id,exercise_id,order_index")
      .in("workout_id", workoutIds)
      .eq("is_archived", false)
      .order("order_index", { ascending: true });

    if (workoutExercisesRes.error) throw workoutExercisesRes.error;
    exerciseRows = (workoutExercisesRes.data ?? []) as WorkoutExerciseRow[];
  }

  return {
    plan: planRes.data as PlanRow | null,
    goals: ((goalsRes.data ?? []) as unknown as GoalRow[]).map(normalizeGoal),
    workouts: loadedPlanWorkouts,
    exercises: exerciseRows,
  };
}

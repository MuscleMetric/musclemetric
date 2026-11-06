export type Metric = "weight" | "reps" | "distance" | "time";

export type GoalRow = {
  id: string;
  exercise_id: string;
  metrics: Metric[] | null;
  type?: string;
  target_number?: number;
  notes?: string | null;
  goal_summary: string | null;

  start_weight: number | null;
  start_reps: number | null;
  start_distance: number | null;
  start_time_seconds: number | null;

  target_weight: number | null;
  target_reps: number | null;
  target_distance: number | null;
  target_time_seconds: number | null;

  exercises?:
    | {
        name: string;
      }[]
    | null;
};

export type PlanRow = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
};

export type PlanWorkoutRow = {
  id: string;
  title: string;
  order_index: number | null;
  workout_id: string;
};

export type WorkoutExerciseRow = {
  workout_id: string;
  exercise_id: string;
  order_index: number;
};

export function getMetricValue(
  goal: GoalRow,
  metric: Metric,
  side: "start" | "target",
) {
  const key =
    `${side}_${metric === "time" ? "time_seconds" : metric}` as keyof GoalRow;
  const value = goal[key];

  return typeof value === "number" ? value : null;
}

export function formatMetric(metric: Metric, value: number) {
  return String(roundMetric(metric, value));
}

function roundMetric(metric: Metric, value: number) {
  if (metric === "weight") return Math.round(value / 2.5) * 2.5;
  if (metric === "distance") return Number(value.toFixed(2));
  return Math.round(value);
}

export function positive(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

export function sessionMetric(
  goal: GoalRow,
  metric: Metric,
  sessionIndex: number,
  totalSessions: number,
) {
  const start = getMetricValue(goal, metric, "start");
  const target = getMetricValue(goal, metric, "target");

  if (!positive(start) || !positive(target)) {
    return null;
  }

  const progress =
    totalSessions <= 1
      ? 1
      : (sessionIndex - 1) / Math.max(1, totalSessions - 1);

  const value = start + (target - start) * progress;

  return roundMetric(metric, value);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function roadmapWeeks(plan: PlanRow | null) {
  if (!plan?.start_date || !plan.end_date) return 1;
  return Math.max(
    1,
    Math.ceil(
      (Date.parse(plan.end_date) - Date.parse(plan.start_date)) / WEEK_MS,
    ),
  );
}

export function matchingWorkouts(
  exerciseId: string,
  workouts: PlanWorkoutRow[],
  rows: WorkoutExerciseRow[],
) {
  const ids = new Set(
    rows
      .filter((row) => row.exercise_id === exerciseId)
      .map((row) => row.workout_id),
  );
  return workouts.filter((row) => ids.has(row.workout_id));
}

export function sessionWeek(plan: PlanRow, startedAt: string) {
  if (!plan.start_date) return 1;
  const started = new Date(startedAt);
  const day = Date.UTC(
    started.getFullYear(),
    started.getMonth(),
    started.getDate(),
  );
  return Math.max(
    1,
    Math.min(
      roadmapWeeks(plan),
      1 + Math.floor((day - Date.parse(plan.start_date)) / WEEK_MS),
    ),
  );
}

export type StrengthTarget = {
  goalId: string;
  weight: number | null;
  reps: number | null;
};
export type SessionTargets = Record<string, StrengthTarget[]>;

export function targetsForWorkout(
  data: {
    plan: PlanRow | null;
    goals: GoalRow[];
    workouts: PlanWorkoutRow[];
    exercises: WorkoutExerciseRow[];
  },
  planWorkoutId: string,
  startedAt: string,
): SessionTargets {
  const result: SessionTargets = {};
  if (!data.plan) return result;
  const week = sessionWeek(data.plan, startedAt);
  for (const goal of data.goals) {
    const slots = matchingWorkouts(
      goal.exercise_id,
      data.workouts,
      data.exercises,
    );
    const position = slots.findIndex((slot) => slot.id === planWorkoutId);
    if (position < 0) continue;
    const index = (week - 1) * slots.length + position + 1;
    const total = roadmapWeeks(data.plan) * slots.length;
    const metrics = goal.metrics ?? [];
    const weight = metrics.includes("weight")
      ? sessionMetric(goal, "weight", index, total)
      : null;
    const reps = metrics.includes("reps")
      ? sessionMetric(goal, "reps", index, total)
      : null;
    if (weight == null && reps == null) continue;
    if (
      (metrics.includes("weight") && !positive(weight)) ||
      (metrics.includes("reps") && !positive(reps))
    )
      continue;
    (result[goal.exercise_id] ??= []).push({ goalId: goal.id, weight, reps });
  }
  return result;
}

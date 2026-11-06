import type {
  LiveWorkoutDraft,
  WorkoutLoadPayload,
  LiveExerciseDraft,
} from "./liveWorkoutTypes";

function nowIso() {
  return new Date().toISOString();
}

// simple UUID helper if you don't already have one
export function makeDraftId() {
  // good enough for client draft ids (or use expo-crypto uuid if you prefer)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function initialSetsForExercise(ex: WorkoutLoadPayload["exercises"][number]) {
  const target = ex.prescription?.targetSets ?? null;
  const count = Math.max(1, Math.min(20, target ?? 1)); // default 1 set if not prescribed
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    dropIndex: 0,
    reps: null,
    weight: null,
    timeSeconds: null,
    distance: null,
    notes: null,
  }));
}

/**
 * Canonical builder used by the live session.
 * This matches the RPC payload shape (WorkoutLoadPayload).
 */
export function buildDraftFromBootstrap(args: {
  payload: WorkoutLoadPayload;
  userId: string;
  draftId?: string;
}): LiveWorkoutDraft {
  const { payload, userId } = args;

  const exercises: LiveExerciseDraft[] = payload.exercises
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((ex) => ({
      workoutExerciseId: ex.workoutExerciseId ?? null,
      exerciseId: ex.exerciseId,
      name: ex.name,
      orderIndex: ex.orderIndex,

      equipment: ex.equipment,
      type: ex.type,
      level: ex.level,
      instructions: ex.instructions,

      prescription: ex.prescription,
      lastSession: ex.lastSession,
      historyResolved: true,
      bestE1rm6m: ex.bestE1rm6m ?? null,
      bestSet6m: ex.bestSet6m ?? null,
      totalVolumeAllTime: ex.totalVolumeAllTime,

      isDone: false,
      sets: initialSetsForExercise(ex),
    }));

  const ts = nowIso();

  return {
    draftId: args.draftId ?? makeDraftId(),
    userId,

    workoutId: payload.workout.workoutId,
    planWorkoutId: payload.workout.planWorkoutId,
    isPlanWorkout: payload.workout.isPlanWorkout,

    source: "template",

    title: payload.workout.title,
    notes: payload.workout.notes,
    imageKey: payload.workout.imageKey,

    headerStats: payload.headerStats,
    goals: payload.goals,

    startedAt: ts,
    updatedAt: ts,

    exercises,

    ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
  };
}

// Backwards compat (so any older imports don’t break)
export const buildDraftFromPayload = buildDraftFromBootstrap;

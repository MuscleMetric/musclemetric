import type { SessionTargets } from "@/lib/plans/goalRoadmap";

export type WorkoutLoadPayload = {
  workout: {
    workoutId: string;
    title: string;
    notes: string | null;
    imageKey: string | null;
    isPlanWorkout: boolean;
    planWorkoutId: string | null;
  };
  headerStats: {
    avgDurationSeconds: number | null;
    avgTotalVolume: number | null;
    lastCompletedAt: string | null;
  };
  goals: Array<{
    id: string;
    type: string; // your enum in DB; keep string on client
    targetNumber: number;
    unit: string | null;
    deadline: string | null; // YYYY-MM-DD
    exerciseId: string | null;
    notes: string | null;
  }>;
  exercises: Array<{
    workoutExerciseId: string;
    exerciseId: string;
    orderIndex: number;

    name: string;
    equipment: string | null;
    type: string | null;
    level: string | null;
    instructions: string | null;

    prescription: {
      targetSets: number | null;
      targetReps: number | null;
      targetWeight: number | null;
      targetTimeSeconds: number | null;
      targetDistance: number | null;
      notes: string | null;
      supersetGroup: string | null;
      supersetIndex: number | null;
      isDropset: boolean | null;
    };

    lastSession: {
      completedAt: string | null; // ISO
      sets: Array<{
        setNumber: number;
        dropIndex: number;
        reps: number | null;
        weight: number | null;
        timeSeconds: number | null;
        distance: number | null;
        notes: string | null;
      }>;
    };

    bestE1rm6m: number | null;
    bestSet6m: {
      completedAt: string | null;
      weight: number | null;
      reps: number | null;
      e1rm: number | null;
    } | null;
    totalVolumeAllTime: number | null;
  }>;
};

export type LiveSetDraft = {
  setNumber: number;
  dropIndex: number; // keep 0 for now, but future-proof
  reps: number | null;
  weight: number | null;
  timeSeconds: number | null;
  distance: number | null;
  notes: string | null;
};

export type LiveExerciseDraft = {
  workoutExerciseId: string | null; // if user adds one mid-session, may be null until persisted
  exerciseId: string;
  name: string;
  orderIndex: number;

  // keep a snapshot so modal can show it without re-fetch
  equipment: string | null;
  type: string | null;
  level: string | null;
  instructions: string | null;

  prescription: WorkoutLoadPayload["exercises"][number]["prescription"];
  historyResolved?: boolean;
  lastSession: WorkoutLoadPayload["exercises"][number]["lastSession"];
  bestE1rm6m: number | null;
  bestSet6m: {
    completedAt: string | null;
    weight: number | null;
    reps: number | null;
    e1rm: number | null;
  } | null;
  totalVolumeAllTime: number | null;

  // live state
  isDone: boolean;
  sets: LiveSetDraft[];
};

export type LiveWorkoutDraft = {
  draftId: string;
  sessionTargets?: SessionTargets;
  userId: string;

  workoutId: string | null;
  planWorkoutId: string | null;
  isPlanWorkout: boolean;

  source: "template" | "quick_start";

  title: string;
  notes: string | null;
  imageKey: string | null;

  headerStats: WorkoutLoadPayload["headerStats"];
  goals: WorkoutLoadPayload["goals"];

  startedAt: string; // ISO
  updatedAt: string; // ISO

  exercises: LiveExerciseDraft[];

  ui: {
    activeExerciseIndex: number; // which exercise modal is on
    activeSetNumber: number; // 1-based
  };

  timerRuntimeId?: string | null;
  timerElapsedSeconds?: number; // total “active” time accumulated
  timerLastActiveAt?: string | null;
};

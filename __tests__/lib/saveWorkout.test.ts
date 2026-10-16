/**
 * saveWorkout.test.ts
 *
 * Purpose:
 * Tests the payload builder used when saving a completed workout.
 *
 * These tests verify that LiveWorkoutDraft is converted correctly
 * into the RPC payload for save_completed_workout_v1.
 *
 * This protects:
 * - Quick Start workouts (workout_id = null)
 * - Template workouts (workout_id present)
 * - Exercise filtering (skip empty sets)
 * - Ad-hoc exercises (workout_exercise_id = "")
 * - Duration calculation from draft timer
 *
 * If these tests fail, the user may:
 * - Save corrupted workout history
 * - Save wrong workout_id
 * - Lose sets
 * - Store invalid exercise history
 * - Break stats / goals / PR tracking
 *
 * Update these tests when:
 * - saveWorkout.ts changes
 * - RPC payload shape changes
 * - LiveWorkoutDraft shape changes
 * - Timer logic changes
 */

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

import {
  buildRpcPayloadFromDraft,
  durationSecondsFromDraft,
} from "@/lib/saveWorkout";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";

function makeBaseDraft(
  overrides: Partial<LiveWorkoutDraft> = {},
): LiveWorkoutDraft {
  return {
    draftId: "draft-1",
    userId: "user-1",
    workoutId: null,
    planWorkoutId: null,
    isPlanWorkout: false,
    source: "quick_start",
    title: "Quick Start Workout",
    notes: null,
    imageKey: null,
    headerStats: {
      avgDurationSeconds: null,
      avgTotalVolume: null,
      lastCompletedAt: null,
    },
    goals: [],
    startedAt: "2026-03-17T10:00:00.000Z",
    updatedAt: "2026-03-17T10:00:00.000Z",
    ui: {
      activeExerciseIndex: 0,
      activeSetNumber: 1,
    },
    timerElapsedSeconds: 120,
    timerLastActiveAt: null,
    exercises: [],
    ...overrides,
  };
}

describe("saveWorkout payload building", () => {
  it("builds payload with workout_id null for quick start", () => {
    const draft = makeBaseDraft({
      exercises: [
        {
          workoutExerciseId: null,
          exerciseId: "exercise-1",
          name: "Bench Press",
          orderIndex: 1,
          equipment: "Barbell",
          type: "strength",
          level: "intermediate",
          instructions: null,
          prescription: {
            targetSets: 3,
            targetReps: 8,
            targetWeight: null,
            targetTimeSeconds: null,
            targetDistance: null,
            notes: null,
            supersetGroup: null,
            supersetIndex: null,
            isDropset: false,
          },
          lastSession: {
            completedAt: null,
            sets: [],
          },
          bestE1rm6m: null,
          bestSet6m: null,
          totalVolumeAllTime: null,
          isDone: false,
          sets: [
            {
              setNumber: 1,
              dropIndex: 0,
              reps: 8,
              weight: 60,
              timeSeconds: null,
              distance: null,
              notes: null,
            },
          ],
        },
      ],
    });

    const payload = buildRpcPayloadFromDraft({
      clientSaveId: "client-save-1",
      draft,
    });

    expect(payload.workout_id).toBeNull();
    expect(payload.exercise_history).toHaveLength(1);
    expect(payload.exercise_history[0].workout_exercise_id).toBe("");
  });

  it("builds payload with workout_id for template workouts", () => {
    const draft = makeBaseDraft({
      workoutId: "workout-123",
      source: "template",
      exercises: [],
    });

    const payload = buildRpcPayloadFromDraft({
      clientSaveId: "client-save-2",
      draft,
    });

    expect(payload.workout_id).toBe("workout-123");
  });

  it("skips exercises with no completed sets", () => {
    const draft = makeBaseDraft({
      exercises: [
        {
          workoutExerciseId: null,
          exerciseId: "exercise-1",
          name: "Bench Press",
          orderIndex: 1,
          equipment: "Barbell",
          type: "strength",
          level: "intermediate",
          instructions: null,
          prescription: {
            targetSets: 3,
            targetReps: 8,
            targetWeight: null,
            targetTimeSeconds: null,
            targetDistance: null,
            notes: null,
            supersetGroup: null,
            supersetIndex: null,
            isDropset: false,
          },
          lastSession: {
            completedAt: null,
            sets: [],
          },
          bestE1rm6m: null,
          bestSet6m: null,
          totalVolumeAllTime: null,
          isDone: false,
          sets: [
            {
              setNumber: 1,
              dropIndex: 0,
              reps: null,
              weight: null,
              timeSeconds: null,
              distance: null,
              notes: null,
            },
          ],
        },
      ],
    });

    const payload = buildRpcPayloadFromDraft({
      clientSaveId: "client-save-3",
      draft,
    });

    expect(payload.exercise_history).toHaveLength(0);
  });

  it("calculates duration from draft timer fields", () => {
    const draft = makeBaseDraft({
      timerElapsedSeconds: 120,
      timerLastActiveAt: "2026-03-17T10:00:00.000Z",
    });

    const seconds = durationSecondsFromDraft(draft, "2026-03-17T10:01:00.000Z");

    expect(seconds).toBe(180);
  });
});

import * as Sentry from "@sentry/react-native";
import { supabase } from "@/lib/supabase";
import {
  buildRpcPayloadFromDraft,
  saveCompletedWorkoutFromLiveDraft,
  saveCompletedWorkoutFromReviewPayload,
} from "@/lib/saveWorkout";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";
import type { ReviewPayload } from "@/lib/sessionStore";

jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: jest.fn() },
}));
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));

const completedAt = new Date("2026-10-12T09:00:00.000Z");

function liveDraft(): LiveWorkoutDraft {
  return {
    draftId: "draft-1",
    userId: "user-1",
    workoutId: "workout-1",
    planWorkoutId: "plan-1",
    isPlanWorkout: true,
    source: "template",
    title: "Lower A",
    notes: "Good session",
    imageKey: null,
    headerStats: { avgDurationSeconds: null, avgTotalVolume: null, lastCompletedAt: null },
    goals: [],
    startedAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T09:00:00.000Z",
    timerElapsedSeconds: 3600,
    timerLastActiveAt: null,
    ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
    exercises: [{
      workoutExerciseId: "we-1",
      exerciseId: "squat-1",
      name: "Back Squat",
      orderIndex: 0,
      equipment: "Barbell",
      type: "strength",
      level: null,
      instructions: null,
      prescription: {
        targetSets: 1, targetReps: 5, targetWeight: 100,
        targetTimeSeconds: null, targetDistance: null,
        notes: null, supersetGroup: null, supersetIndex: null, isDropset: false,
      },
      lastSession: { completedAt: null, sets: [] },
      bestE1rm6m: null, bestSet6m: null, totalVolumeAllTime: null, isDone: true,
      sets: [{
        setNumber: 1, dropIndex: 0, reps: 5, weight: 100,
        timeSeconds: null, distance: null, notes: null,
      }],
    }],
  };
}

function legacyReview(): ReviewPayload {
  return {
    workout: {
      id: "workout-1", title: "Lower A",
      workout_exercises: [{
        id: "we-1", exercise_id: "squat-1", order_index: 0,
        target_sets: 1, target_reps: 5, target_weight: 100,
        target_time_seconds: null, target_distance: null,
        notes: null, exercises: { id: "squat-1", name: "Back Squat", type: "strength" },
      }],
    },
    state: {
      workoutNotes: "Good session",
      byWeId: {
        "we-1": {
          kind: "strength", currentSet: 1, completed: true, open: false,
          sets: [{ reps: "5", weight: "100" }],
        },
      },
      startedAt: 0, cardioTimeBonusSec: 0, anyCompleted: true,
    },
    supersets: { byGroup: {}, byWeId: {}, labels: {} },
  };
}

const liveArgs = () => ({
  clientSaveId: "client-save-1",
  draft: liveDraft(),
  completedAt,
  durationSeconds: 3600,
  planWorkoutIdToComplete: "plan-1",
});
const reviewArgs = () => ({
  clientSaveId: "client-save-1",
  ownerUserId: "user-1",
  payload: legacyReview(),
  completedAt,
  totalDurationSec: 3600,
  planWorkoutIdToComplete: "plan-1",
});

beforeEach(() => {
  jest.clearAllMocks();
});

it("saves both workout entry points through the same RPC with the same data contract", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: "history-123", error: null });

  expect(await saveCompletedWorkoutFromLiveDraft(liveArgs()))
    .toEqual({ workoutHistoryId: "history-123" });
  expect(await saveCompletedWorkoutFromReviewPayload(reviewArgs()))
    .toEqual({ workoutHistoryId: "history-123" });

  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  for (const call of (supabase.rpc as jest.Mock).mock.calls) {
    expect(call[0]).toBe("save_completed_workout_v2");
    expect(call[1].p_expected_user_id).toBe("user-1");
    expect(call[1].p_workout).toEqual(expect.objectContaining({
      client_save_id: "client-save-1",
      workout_id: "workout-1",
      plan_workout_id: "plan-1",
      duration_seconds: 3600,
      completed_at: completedAt.toISOString(),
    }));
    expect(call[1].p_workout.exercise_history).toHaveLength(1);
    expect(call[1].p_workout.exercise_history[0].sets).toHaveLength(1);
  }
});

it.each(["live", "review"] as const)(
  "surfaces a %s RPC rejection and reports it to Sentry only once",
  async (source) => {
    const dbError = {
      name: "PostgrestError", message: "Unable to save",
      code: "42501", details: "permission denied", hint: "",
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: dbError });

    await expect(source === "live"
      ? saveCompletedWorkoutFromLiveDraft(liveArgs())
      : saveCompletedWorkoutFromReviewPayload(reviewArgs()))
      .rejects.toThrow("Unable to save");

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      dbError, expect.objectContaining({ tags: { area: "save_rpc", fn: "save_completed_workout_v2" } }),
    );
  },
);

it("reports unexpected network exceptions without changing their identity", async () => {
  const error = new Error("Network request failed");
  (supabase.rpc as jest.Mock).mockRejectedValue(error);

  await expect(saveCompletedWorkoutFromLiveDraft(liveArgs())).rejects.toBe(error);
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  expect(Sentry.captureException).toHaveBeenCalledWith(
    error, expect.objectContaining({ tags: { area: "save_rpc", stage: "unexpected" } }),
  );
});

it("keeps the same client_save_id when a live workout save is retried", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: "existing-history", error: null });
  const args = liveArgs();

  await saveCompletedWorkoutFromLiveDraft(args);
  await saveCompletedWorkoutFromLiveDraft(args);

  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect((supabase.rpc as jest.Mock).mock.calls.map((call) => call[1].p_workout.client_save_id))
    .toEqual(["client-save-1", "client-save-1"]);
  expect((supabase.rpc as jest.Mock).mock.calls.map((call) => call[1].p_expected_user_id))
    .toEqual(["user-1", "user-1"]);
});

it("serializes cardio distance and time without adding strength-only fields", () => {
  const draft = liveDraft();
  draft.exercises[0] = {
    ...draft.exercises[0],
    exerciseId: "run-1", name: "Tempo Run", type: "cardio", equipment: null,
    sets: [{
      setNumber: 1, dropIndex: 0, reps: null, weight: null,
      timeSeconds: 1800, distance: 5.5, notes: null,
    }],
  };
  const payload = buildRpcPayloadFromDraft({
    clientSaveId: "cardio-save-1", draft, completedAt,
  });

  expect(payload.exercise_history[0].sets).toEqual([{
    set_number: 1, drop_index: 0, reps: null, weight: null,
    time_seconds: 1800, distance: 5.5, notes: null,
  }]);
});

it("preserves queued owner's identity even when the request starts under another session", async () => {
  // The mocked RPC emulates the v2 database contract. Its actual-JWT owner is
  // user-b, but the queued job originated from user-1. It must be rejected.
  let requestUserId = "user-1";
  (supabase.rpc as jest.Mock).mockImplementation(async (name, params) => {
    expect(name).toBe("save_completed_workout_v2");
    requestUserId = "user-b"; // account switched just before RPC token attachment
    expect(params.p_expected_user_id).toBe("user-1");
    return requestUserId === params.p_expected_user_id
      ? { data: "saved", error: null }
      : { data: null, error: { name: "PostgrestError", code: "42501", message: "workout_owner_mismatch" } };
  });

  await expect(saveCompletedWorkoutFromReviewPayload(reviewArgs()))
    .rejects.toThrow("workout_owner_mismatch");
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});

it("always passes the persisted draft's user, not a newly signed-in user", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: "saved", error: null });
  const args = liveArgs();
  await saveCompletedWorkoutFromLiveDraft(args);
  expect(supabase.rpc).toHaveBeenCalledWith("save_completed_workout_v2", {
    p_workout: expect.anything(),
    p_expected_user_id: args.draft.userId,
  });
});

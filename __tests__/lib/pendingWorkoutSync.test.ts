import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { saveCompletedWorkoutFromReviewPayload } from "@/lib/saveWorkout";
import { syncPendingWorkouts, type PendingWorkoutJob } from "@/lib/pendingWorkoutSync";
import type { ReviewPayload } from "@/lib/sessionStore";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock("@/lib/saveWorkout", () => ({
  saveCompletedWorkoutFromReviewPayload: jest.fn(),
}));
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock("uuid", () => ({ v4: jest.fn(() => "new-id") }));

const queueKey = "mm_pending_workout_saves_v1";
const fakeReview = {
  workout: { id: "workout-1", title: "Test session" },
} as ReviewPayload;

function job(id: string): PendingWorkoutJob {
  return {
    clientSaveId: id,
    createdAtIso: "2026-10-12T08:00:00.000Z",
    payload: fakeReview,
    totalDurationSec: 1800,
    completedAtIso: "2026-10-12T09:00:00.000Z",
    planWorkoutIdToComplete: "plan-1",
    attempts: 0,
    lastError: null,
  };
}

let stored: string;

function pendingJobs(): PendingWorkoutJob[] {
  return JSON.parse(stored) as PendingWorkoutJob[];
}

beforeEach(() => {
  jest.clearAllMocks();
  stored = JSON.stringify([job("save-1"), job("save-2")]);
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
    expect(key).toBe(queueKey);
    return stored;
  });
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      expect(key).toBe(queueKey);
      stored = value;
    },
  );
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "user-1" } } },
  });
  (saveCompletedWorkoutFromReviewPayload as jest.Mock).mockResolvedValue({
    workoutHistoryId: "history-1",
  });
});

it("removes successfully synced jobs and reports the correct count", async () => {
  await expect(syncPendingWorkouts()).resolves.toEqual({
    synced: 2, remaining: 0, stoppedBecauseAuth: false,
  });
  expect(pendingJobs()).toEqual([]);
  expect(saveCompletedWorkoutFromReviewPayload).toHaveBeenCalledTimes(2);
});

it.each([
  ["network", "Network request failed", false],
  ["expired auth", "JWT expired", true],
] as const)(
  "retains the failed job and unattempted jobs after a %s failure",
  async (_reason, message, stoppedBecauseAuth) => {
    (saveCompletedWorkoutFromReviewPayload as jest.Mock)
      .mockRejectedValueOnce(new Error(message));

    await expect(syncPendingWorkouts()).resolves.toEqual({
      synced: 0, remaining: 2, stoppedBecauseAuth,
    });

    expect(pendingJobs().map((j) => j.clientSaveId)).toEqual(["save-1", "save-2"]);
    expect(pendingJobs()[0]).toEqual(expect.objectContaining({
      clientSaveId: "save-1", attempts: 1, lastError: message,
    }));
    expect(pendingJobs()[1]).toEqual(job("save-2"));
    expect(saveCompletedWorkoutFromReviewPayload).toHaveBeenCalledTimes(1);
  },
);

it("retains a generic failed job while successfully syncing the next one", async () => {
  (saveCompletedWorkoutFromReviewPayload as jest.Mock)
    .mockRejectedValueOnce(new Error("Server unavailable"))
    .mockResolvedValueOnce({ workoutHistoryId: "history-2" });

  await expect(syncPendingWorkouts()).resolves.toEqual({
    synced: 1, remaining: 1, stoppedBecauseAuth: false,
  });

  expect(pendingJobs()).toEqual([
    expect.objectContaining({
      clientSaveId: "save-1", attempts: 1, lastError: "Server unavailable",
    }),
  ]);
  expect(saveCompletedWorkoutFromReviewPayload).toHaveBeenCalledTimes(2);
});

it("retries a previously failed upload with the original clientSaveId", async () => {
  stored = JSON.stringify([job("save-1")]);
  (saveCompletedWorkoutFromReviewPayload as jest.Mock)
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ workoutHistoryId: "history-1" });

  await syncPendingWorkouts();
  expect(pendingJobs()).toEqual([expect.objectContaining({
    clientSaveId: "save-1", attempts: 1,
  })]);

  await expect(syncPendingWorkouts()).resolves.toEqual({
    synced: 1, remaining: 0, stoppedBecauseAuth: false,
  });
  expect(pendingJobs()).toEqual([]);
  expect((saveCompletedWorkoutFromReviewPayload as jest.Mock).mock.calls.map(
    ([args]) => args.clientSaveId,
  )).toEqual(["save-1", "save-1"]);
});

it("does not touch queued workouts when no session is available", async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: null },
  });

  await expect(syncPendingWorkouts()).resolves.toEqual({
    synced: 0, remaining: 2, stoppedBecauseAuth: true,
  });
  expect(saveCompletedWorkoutFromReviewPayload).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(pendingJobs().map((j) => j.clientSaveId)).toEqual(["save-1", "save-2"]);
});

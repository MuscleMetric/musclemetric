import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { saveCompletedWorkoutFromReviewPayload } from "@/lib/saveWorkout";
import {
  enqueuePendingWorkout,
  getLegacyPendingCount,
  getPendingCount,
  syncPendingWorkouts,
  type PendingWorkoutJob,
} from "@/lib/pendingWorkoutSync";
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

const LEGACY_KEY = "mm_pending_workout_saves_v1";
const keyFor = (uid: string) => `mm_pending_workout_saves_v2:${uid}`;
const review = {
  workout: { id: "workout-1", title: "Test session" },
} as ReviewPayload;

function job(id: string, ownerUserId = "user-a"): PendingWorkoutJob {
  return {
    ownerUserId,
    clientSaveId: id,
    createdAtIso: "2026-10-12T08:00:00.000Z",
    payload: review,
    totalDurationSec: 1800,
    completedAtIso: "2026-10-12T09:00:00.000Z",
    planWorkoutIdToComplete: "plan-1",
    attempts: 0,
    lastError: null,
  };
}

let user: string | null;
let storage: Map<string, string>;

function jobs(uid: string): PendingWorkoutJob[] {
  return JSON.parse(storage.get(keyFor(uid)) ?? "[]") as PendingWorkoutJob[];
}

beforeEach(() => {
  jest.clearAllMocks();
  user = "user-a";
  storage = new Map<string, string>([
    [keyFor("user-a"), JSON.stringify([job("save-1"), job("save-2")])],
  ]);
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    storage.get(key) ?? null
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => { storage.set(key, value); },
  );
  (supabase.auth.getSession as jest.Mock).mockImplementation(async () => ({
    data: { session: user ? { user: { id: user } } : null },
    error: null,
  }));
  (saveCompletedWorkoutFromReviewPayload as jest.Mock).mockResolvedValue({
    workoutHistoryId: "history-1",
  });
});

it("syncs only the signed-in user's queue and leaves another account untouched", async () => {
  storage.set(keyFor("user-b"), JSON.stringify([job("save-b", "user-b")]));
  expect(await syncPendingWorkouts()).toEqual({
    synced: 2, remaining: 0, stoppedBecauseAuth: false,
  });
  expect(jobs("user-a")).toEqual([]);
  expect(jobs("user-b")).toEqual([job("save-b", "user-b")]);
  expect((saveCompletedWorkoutFromReviewPayload as jest.Mock).mock.calls.map(
    ([args]) => args.clientSaveId,
  )).toEqual(["save-1", "save-2"]);
});

it("does not attribute legacy jobs with unknown owners to the current user", async () => {
  const legacy = JSON.stringify([{ ...job("old-job"), ownerUserId: undefined }]);
  storage.set(LEGACY_KEY, legacy);
  expect(await getLegacyPendingCount()).toBe(1);

  user = "user-b";
  expect(await syncPendingWorkouts()).toEqual({
    synced: 0, remaining: 0, stoppedBecauseAuth: false,
  });
  expect(storage.get(LEGACY_KEY)).toBe(legacy);
  expect(jobs("user-a")).toEqual([job("save-1"), job("save-2")]);
  expect(saveCompletedWorkoutFromReviewPayload).not.toHaveBeenCalled();
});

it("never uploads a foreign or unowned job found inside a user queue", async () => {
  const wrong = { ...job("unowned"), ownerUserId: "" };
  storage.set(keyFor("user-a"), JSON.stringify([wrong, job("save-1", "user-b"), job("save-2")]));

  expect(await syncPendingWorkouts()).toEqual({
    synced: 1, remaining: 2, stoppedBecauseAuth: false,
  });
  expect(jobs("user-a")).toEqual([wrong, job("save-1", "user-b")]);
  expect((saveCompletedWorkoutFromReviewPayload as jest.Mock).mock.calls[0][0]
    .clientSaveId).toBe("save-2");
});

it("enqueues only while signed in, binding the owner to the queue", async () => {
  const input = {
    payload: review,
    completedAt: new Date("2026-10-12T09:00:00Z"),
    totalDurationSec: 100,
  };
  user = "user-b";
  const added = await enqueuePendingWorkout(input);
  expect(added.ownerUserId).toBe("user-b");
  expect(added.clientSaveId).toBe("new-id");
  expect(jobs("user-b")).toEqual([added]);
  expect(jobs("user-a")).toHaveLength(2);
  expect(await getPendingCount()).toBe(1);

  user = null;
  await expect(enqueuePendingWorkout(input)).rejects.toThrow(/signed-in/);
  expect(await getPendingCount()).toBe(0);
});

it.each([
  ["network", "Network request failed", false],
  ["expired auth", "JWT expired", true],
] as const)(
  "retains the failed and unattempted jobs after a %s failure",
  async (_reason, message, stoppedBecauseAuth) => {
    (saveCompletedWorkoutFromReviewPayload as jest.Mock)
      .mockRejectedValueOnce(new Error(message));

    expect(await syncPendingWorkouts()).toEqual({
      synced: 0, remaining: 2, stoppedBecauseAuth,
    });
    expect(jobs("user-a").map((j) => j.clientSaveId)).toEqual(["save-1", "save-2"]);
    expect(jobs("user-a")[0]).toEqual(expect.objectContaining({
      ownerUserId: "user-a", clientSaveId: "save-1",
      attempts: 1, lastError: message,
    }));
    expect(jobs("user-a")[1]).toEqual(job("save-2"));
    expect(saveCompletedWorkoutFromReviewPayload).toHaveBeenCalledTimes(1);
  },
);

it("retries the original idempotency key after a transient network failure", async () => {
  storage.set(keyFor("user-a"), JSON.stringify([job("save-1")]));
  (saveCompletedWorkoutFromReviewPayload as jest.Mock)
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ workoutHistoryId: "history-1" });

  await syncPendingWorkouts();
  expect(jobs("user-a")[0]).toEqual(expect.objectContaining({
    clientSaveId: "save-1", attempts: 1,
  }));
  expect(await syncPendingWorkouts()).toEqual({
    synced: 1, remaining: 0, stoppedBecauseAuth: false,
  });
  expect(jobs("user-a")).toEqual([]);
  expect((saveCompletedWorkoutFromReviewPayload as jest.Mock).mock.calls.map(
    ([args]) => args.clientSaveId,
  )).toEqual(["save-1", "save-1"]);
});

it("stops before the next job if the user changes mid-sync", async () => {
  (saveCompletedWorkoutFromReviewPayload as jest.Mock).mockImplementationOnce(async () => {
    user = "user-b";
    return { workoutHistoryId: "history-1" };
  });

  expect(await syncPendingWorkouts()).toEqual({
    synced: 1, remaining: 1, stoppedBecauseAuth: true,
  });
  expect(jobs("user-a")).toEqual([job("save-2")]);
  expect(saveCompletedWorkoutFromReviewPayload).toHaveBeenCalledTimes(1);

  user = "user-a";
  expect(await syncPendingWorkouts()).toEqual({
    synced: 1, remaining: 0, stoppedBecauseAuth: false,
  });
});

it("does not process or change queued workouts while signed out", async () => {
  user = null;
  expect(await syncPendingWorkouts()).toEqual({
    synced: 0, remaining: 0, stoppedBecauseAuth: true,
  });
  expect(jobs("user-a")).toHaveLength(2);
  expect(saveCompletedWorkoutFromReviewPayload).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it("does not overwrite an enqueue that overlaps a running sync", async () => {
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  let finishUpload!: () => void;
  const holdUpload = new Promise<void>((resolve) => { finishUpload = resolve; });
  (saveCompletedWorkoutFromReviewPayload as jest.Mock)
    .mockImplementationOnce(async () => {
      signalStarted();
      await holdUpload;
      return { workoutHistoryId: "history-1" };
    });
  storage.set(keyFor("user-a"), JSON.stringify([job("save-1")]));

  const syncing = syncPendingWorkouts();
  await started;
  const adding = enqueuePendingWorkout({
    payload: review,
    totalDurationSec: 90,
    completedAt: new Date("2026-10-12T09:00:00Z"),
  });
  finishUpload();
  await syncing;
  const added = await adding;
  expect(jobs("user-a")).toEqual([added]);
});

it("does not overwrite an invalid or corrupted queue", async () => {
  storage.set(keyFor("user-a"), "{invalid");
  await expect(syncPendingWorkouts()).rejects.toThrow();
  expect(storage.get(keyFor("user-a"))).toBe("{invalid");
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

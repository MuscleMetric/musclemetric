import { liveWorkoutClientSaveId, assertCurrentWorkoutOwner, markLiveDraftCompleted, markLiveDraftSaveAttempt, isLiveDraftCompleted } from "@/lib/workoutSaveIdentity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: jest.fn() }, from: jest.fn() } }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

import { buildEmptyQuickStartDraft } from "@/app/features/workouts/live/builders/buildEmptyQuickStartDraft";
import { buildDraftFromBootstrap } from "@/app/features/workouts/hooks/buildDraft";
import type { WorkoutLoadPayload } from "@/app/features/workouts/live/state/types";

const userId = "person-a";

it("uses the same UUID after a quick-start draft is persisted and reopened", () => {
  const draft = buildEmptyQuickStartDraft({ userId });
  const before = liveWorkoutClientSaveId(draft, userId);
  const restored = JSON.parse(JSON.stringify(draft));
  const after = liveWorkoutClientSaveId(restored, userId);

  expect(after).toBe(before);
  expect(after).toBe(draft.draftId);
});

it("keeps a separate client-save ID for each new workout session", () => {
  const first = buildEmptyQuickStartDraft({ userId });
  const second = buildEmptyQuickStartDraft({ userId });

  expect(liveWorkoutClientSaveId(first, userId)).not.toBe(
    liveWorkoutClientSaveId(second, userId),
  );
});

it("uses the same ID for planned workouts across review screen restarts", () => {
  const payload: WorkoutLoadPayload = {
    workout: {
      workoutId: "workout-1",
      title: "Lower A",
      notes: null,
      imageKey: null,
      isPlanWorkout: true,
      planWorkoutId: "plan-1",
    },
    headerStats: {
      avgDurationSeconds: null,
      avgTotalVolume: null,
      lastCompletedAt: null,
    },
    goals: [],
    exercises: [],
  };
  const draft = buildDraftFromBootstrap({ payload, userId });
  const before = liveWorkoutClientSaveId(draft, userId);
  expect(liveWorkoutClientSaveId(JSON.parse(JSON.stringify(draft)), userId))
    .toBe(before);
});

it("rejects saving a retained draft after switching accounts", () => {
  const draft = buildEmptyQuickStartDraft({ userId });
  expect(() => liveWorkoutClientSaveId(draft, "person-b")).toThrow(/another account/);
});

it("fails closed rather than inventing a new id for a damaged draft", () => {
  const draft = buildEmptyQuickStartDraft({ userId });
  const invalid = { ...draft, draftId: "" };
  expect(() => liveWorkoutClientSaveId(invalid, userId)).toThrow(/valid save ID/);
});


it("allows save confirmation only when fresh authenticated user owns the draft", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: userId } }, error: null,
  });
  await expect(assertCurrentWorkoutOwner(userId)).resolves.toBeUndefined();
  expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
});

it("blocks confirmation when account changed while save Alert was open", async () => {
  // The alert was opened with user A. The real authentication state is B
  // by the time the user presses its Save button.
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "person-b" } }, error: null,
  });
  await expect(assertCurrentWorkoutOwner(userId)).rejects.toThrow(/account changed/);
});

it("blocks confirmation if user signed out while the Alert was open", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: null }, error: null,
  });
  await expect(assertCurrentWorkoutOwner(userId)).rejects.toThrow(/account changed/);
});

it("blocks confirmation if authentication verification fails", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: null }, error: { message: "Failed to fetch user" },
  });
  await expect(assertCurrentWorkoutOwner(userId)).rejects.toThrow(/account changed/);
});

describe("completed live draft guard", () => {
  let storage: Map<string, string>;
  let serverRows: Map<string, { id: string }>;
  const makeDraft = () => buildEmptyQuickStartDraft({ userId });

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new Map();
    serverRows = new Map();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => storage.get(key) ?? null);
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      storage.set(key, value);
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      expect(table).toBe("workout_history");
      const filters: Record<string, string> = {};
      const query: { select: jest.Mock; eq: jest.Mock; maybeSingle: jest.Mock } = {
        select: jest.fn(() => query),
        eq: jest.fn((column: string, value: string) => {
          filters[column] = value;
          return query;
        }),
        maybeSingle: jest.fn(async () => ({
          data: filters.user_id === userId ? serverRows.get(filters.client_save_id) ?? null : null,
          error: null,
        })),
      };
      return query;
    });
  });

  it("marks a successful save and blocks resuming the exact same draft after cleanup fails", async () => {
    const draft = makeDraft();
    await markLiveDraftCompleted(userId, draft.draftId);
    const restored = JSON.parse(JSON.stringify(draft));
    await expect(isLiveDraftCompleted(restored, userId)).resolves.toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(await isLiveDraftCompleted(makeDraft(), userId)).toBe(false);
  });

  it("detects a committed workout from the server if the app crashed before writing the marker", async () => {
    const draft = makeDraft();
    // The app crashed after sending the RPC but before writing the success marker.
    await markLiveDraftSaveAttempt(userId, draft.draftId);
    serverRows.set(draft.draftId, { id: "saved-history-id" });
    expect(await isLiveDraftCompleted(draft, userId)).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("workout_history");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      `mm:completedLiveDraft:${userId}:${draft.draftId}`, "1",
    );
  });

  it("does not resume an unverified draft when the history lookup fails", async () => {
    const draft = makeDraft();
    await markLiveDraftSaveAttempt(userId, draft.draftId);
    (supabase.from as jest.Mock).mockImplementation(() => {
      const query: { select: jest.Mock; eq: jest.Mock; maybeSingle: jest.Mock } = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        maybeSingle: jest.fn(async () => ({ data: null, error: { message: "offline" } })),
      };
      return query;
    });
    await expect(isLiveDraftCompleted(draft, userId)).rejects.toThrow(/Reconnect/);
  });

  it("allows never-submitted local drafts to resume when the online verification fails", async () => {
    const draft = makeDraft();
    (supabase.from as jest.Mock).mockImplementation(() => {
      throw new Error("network offline");
    });
    expect(await isLiveDraftCompleted(draft, userId)).toBe(false);
    expect(supabase.from).toHaveBeenCalledWith("workout_history");
  });

  it("always checks a server-originated draft even without a local attempt marker", async () => {
    const draft = makeDraft();
    serverRows.set(draft.draftId, { id: "completed-on-other-device" });
    expect(await isLiveDraftCompleted(draft, userId, { checkServer: true })).toBe(true);
  });


  it("also catches a draft previously cached locally from another device's server", async () => {
    const draft = makeDraft();
    // No attempt marker exists on this device. Another device has saved it.
    serverRows.set(draft.draftId, { id: "saved-elsewhere" });
    expect(await isLiveDraftCompleted(draft, userId)).toBe(true);
  });

  it("never trusts another account's completion marker", async () => {
    const draft = makeDraft();
    await markLiveDraftCompleted(userId, draft.draftId);
    await expect(isLiveDraftCompleted(draft, "person-b")).rejects.toThrow(/another account/);
  });
});

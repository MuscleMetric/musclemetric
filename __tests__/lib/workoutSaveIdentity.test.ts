import { liveWorkoutClientSaveId, assertCurrentWorkoutOwner } from "@/lib/workoutSaveIdentity";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: jest.fn() } } }));

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

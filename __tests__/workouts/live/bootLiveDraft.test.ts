/**
 * bootLiveDraft.test.ts
 *
 * Purpose:
 * Tests the boot order logic for starting a live workout session.
 *
 * This file protects the core live workout entry flow, which must:
 * 1. Resume server draft if newer
 * 2. Resume local draft if no newer server draft
 * 3. Bootstrap from RPC when workoutId is provided
 * 4. Create a Quick Start draft when no workoutId is provided
 *
 * This is critical for:
 * - Live workout resume
 * - Quick Start workout feature
 * - Template workout start
 * - Plan workout start
 *
 * If these tests fail, the user may:
 * - Lose workout progress
 * - Start the wrong workout
 * - Crash when starting a workout
 *
 * Update these tests when:
 * - bootLiveDraft logic changes
 * - LiveWorkoutDraft shape changes
 * - Quick Start behaviour changes
 * - Server/local draft priority rules change
 */

import { bootLiveDraft } from "@/app/features/workouts/live/boot/bootLiveDraft";
import { buildEmptyQuickStartDraft } from "@/app/features/workouts/live/builders/buildEmptyQuickStartDraft";
import { supabase } from "@/lib/supabase";
import { loadLiveDraftForUser, saveLiveDraftForUser } from "@/app/features/workouts/live/persist/local";
import { fetchServerDraft } from "@/app/features/workouts/live/persist/server";
import { isLiveDraftCompleted } from "@/lib/workoutSaveIdentity";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock("@/app/features/workouts/live/persist/local", () => ({
  loadLiveDraftForUser: jest.fn(),
  saveLiveDraftForUser: jest.fn(),
}));

jest.mock("@/app/features/workouts/live/persist/server", () => ({
  fetchServerDraft: jest.fn(),
}));

jest.mock("@/lib/workoutSaveIdentity", () => ({
  isLiveDraftCompleted: jest.fn(),
}));

describe("bootLiveDraft", () => {
  const userId = "user-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (isLiveDraftCompleted as jest.Mock).mockResolvedValue(false);
  });

  it("returns server draft when server is newer", async () => {
    const localDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "local-draft",
      updatedAt: "2026-03-17T10:00:00.000Z",
    };

    const serverDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "server-draft",
      updatedAt: "2026-03-17T11:00:00.000Z",
    };

    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(localDraft);
    (fetchServerDraft as jest.Mock).mockResolvedValue(serverDraft);

    const result = await bootLiveDraft({ userId, preferServer: true });

    expect(result.draftId).toBe("server-draft");
    expect(saveLiveDraftForUser).toHaveBeenCalledWith(userId, serverDraft);
  });

  it("returns local draft when no newer server draft exists", async () => {
    const localDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "local-draft",
      updatedAt: "2026-03-17T10:00:00.000Z",
    };

    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(localDraft);
    (fetchServerDraft as jest.Mock).mockResolvedValue(null);

    const result = await bootLiveDraft({ userId, preferServer: true });

    expect(result.draftId).toBe("local-draft");
  });

  it("ignores a stale server draft that has already been committed and creates a fresh session", async () => {
    const savedServerDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "old-completed-draft",
    };
    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(null);
    (fetchServerDraft as jest.Mock).mockResolvedValue(savedServerDraft);
    (isLiveDraftCompleted as jest.Mock).mockImplementation(
      async (draft: { draftId: string }) => draft.draftId === "old-completed-draft",
    );

    const fresh = await bootLiveDraft({ userId, preferServer: true });

    expect(fresh.draftId).not.toBe(savedServerDraft.draftId);
    expect(fresh.source).toBe("quick_start");
    expect(saveLiveDraftForUser).toHaveBeenCalledWith(userId, fresh);
    expect(saveLiveDraftForUser).not.toHaveBeenCalledWith(userId, savedServerDraft);
  });

  it("uses an unfinished local draft instead of a newer completed server draft", async () => {
    const localDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "unfinished-local",
      updatedAt: "2026-10-14T09:00:00Z",
    };
    const serverDraft = {
      ...buildEmptyQuickStartDraft({ userId }),
      draftId: "already-saved-server",
      updatedAt: "2026-10-14T10:00:00Z",
    };
    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(localDraft);
    (fetchServerDraft as jest.Mock).mockResolvedValue(serverDraft);
    (isLiveDraftCompleted as jest.Mock).mockImplementation(
      async (draft: { draftId: string }) => draft.draftId === "already-saved-server",
    );

    expect(await bootLiveDraft({ userId })).toEqual(localDraft);
  });

  it("blocks restoring any candidate when saved-state verification is unavailable", async () => {
    const serverDraft = buildEmptyQuickStartDraft({ userId });
    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(null);
    (fetchServerDraft as jest.Mock).mockResolvedValue(serverDraft);
    (isLiveDraftCompleted as jest.Mock).mockRejectedValue(new Error("Reconnect and try again"));

    await expect(bootLiveDraft({ userId })).rejects.toThrow(/Reconnect/);
    expect(saveLiveDraftForUser).not.toHaveBeenCalled();
  });

  it("bootstraps from RPC when workoutId exists and no saved drafts exist", async () => {
    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(null);
    (fetchServerDraft as jest.Mock).mockResolvedValue(null);

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        workout: {
          workoutId: "workout-123",
          title: "Push Day",
          notes: null,
          imageKey: null,
          isPlanWorkout: false,
          planWorkoutId: null,
        },
        headerStats: {
          avgDurationSeconds: null,
          avgTotalVolume: null,
          lastCompletedAt: null,
        },
        goals: [],
        exercises: [],
      },
      error: null,
    });

    const result = await bootLiveDraft({
      userId,
      workoutId: "workout-123",
      preferServer: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith("get_workout_session_bootstrap", {
      p_workout_id: "workout-123",
      p_plan_workout_id: null,
    });

    expect(result.workoutId).toBe("workout-123");
    expect(result.source).toBe("template");
  });

  it("creates a quick start draft when no workoutId exists", async () => {
    (loadLiveDraftForUser as jest.Mock).mockResolvedValue(null);
    (fetchServerDraft as jest.Mock).mockResolvedValue(null);

    const result = await bootLiveDraft({
      userId,
      preferServer: true,
    });

    expect(result.workoutId).toBeNull();
    expect(result.source).toBe("quick_start");
    expect(result.exercises).toEqual([]);
    expect(saveLiveDraftForUser).toHaveBeenCalled();
  });
});
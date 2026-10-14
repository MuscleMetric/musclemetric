import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The live draft is persisted locally and on the server with a stable UUID.
// Using the draft ID as client_save_id makes ambiguous network retries
// idempotent even after the review screen or the app restarts.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function liveWorkoutClientSaveId(
  draft: Pick<LiveWorkoutDraft, "draftId" | "userId">,
  authenticatedUserId: string,
): string {
  if (!authenticatedUserId || draft.userId !== authenticatedUserId) {
    throw new Error("This workout belongs to another account. Please reopen it.");
  }

  if (!UUID_PATTERN.test(draft.draftId)) {
    // Never silently invent a new save ID here: doing so can create duplicates
    // after the server committed but the device lost the acknowledgement.
    throw new Error("Workout draft has no valid save ID. Please reopen it.");
  }

  return draft.draftId;
}

/**
 * Called at confirmation time (not when opening the Alert). Auth may have
 * changed while the dialog was visible. This is only an early client guard:
 * save_completed_workout_v2 independently compares the actual RPC JWT to
 * the original draft/queued-job owner in the same database request.
 */
export async function assertCurrentWorkoutOwner(expectedUserId: string): Promise<void> {
  if (!expectedUserId) {
    throw new Error("Workout owner is missing. Please reopen the workout.");
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== expectedUserId) {
    throw new Error("Your account changed. Please reopen your workout before saving.");
  }
}

/**
 * Mark an acknowledged live workout as completed *before* attempting cleanup.
 * The marker is account- and draft-scoped; it must not be removed when a new
 * workout starts. A failed server draft deletion cannot make the old draft
 * editable again on this device.
 */
const completedDraftKey = (userId: string, draftId: string) =>
  `mm:completedLiveDraft:${userId}:${draftId}`;

const attemptedDraftKey = (userId: string, draftId: string) =>
  `mm:attemptedLiveDraftSave:${userId}:${draftId}`;

/** Persist before issuing a save RPC so a crash cannot hide an ambiguous save. */
export async function markLiveDraftSaveAttempt(userId: string, draftId: string): Promise<void> {
  await AsyncStorage.setItem(attemptedDraftKey(userId, draftId), "1");
}

export async function markLiveDraftCompleted(userId: string, draftId: string): Promise<void> {
  await AsyncStorage.setItem(completedDraftKey(userId, draftId), "1");
}

/**
 * Verify that a candidate draft has not already been committed. This server
 * check covers the small crash window after the RPC commits but before the
 * device stores the local completion marker.
 *
 * On network/auth errors we fail closed rather than silently editing an
 * already-saved draft and losing any newly entered sets on an idempotent retry.
 */
export async function isLiveDraftCompleted(
  draft: Pick<LiveWorkoutDraft, "draftId" | "userId">,
  userId: string,
  options?: { checkServer?: boolean },
): Promise<boolean> {
  if (!userId || draft.userId !== userId) {
    throw new Error("This workout belongs to another account. Please reopen it.");
  }

  if (await AsyncStorage.getItem(completedDraftKey(userId, draft.draftId))) {
    return true;
  }

  // Older/invalid IDs could not have been sent through the stable-UUID saver.
  if (!UUID_PATTERN.test(draft.draftId)) return false;

  // Always check when online: a local draft may have originally come from
  // another device's server cache, then been completed elsewhere.
  // Only a never-submitted local draft may resume *offline* without a check;
  // it must be verified again before any upload.
  const wasAttempted = !!(await AsyncStorage.getItem(
    attemptedDraftKey(userId, draft.draftId),
  ));
  let savedHistoryId: string | null = null;

  try {
    const { data, error } = await supabase
      .from("workout_history")
      .select("id")
      .eq("user_id", userId)
      .eq("client_save_id", draft.draftId)
      .maybeSingle();

    if (error) throw error;
    savedHistoryId = data?.id ?? null;
  } catch {
    if (!wasAttempted && !options?.checkServer) {
      // Reading/editing an unattempted local draft offline is safe. The save
      // path forces a fresh server check before it can commit anything.
      return false;
    }
    throw new Error("Could not verify whether this workout was already saved. Reconnect and try again.");
  }

  if (!savedHistoryId) return false;

  // The server is authoritative. Persist the result for offline/next boot.
  try {
    await markLiveDraftCompleted(userId, draft.draftId);
  } catch {
    // Safe to return true; another boot can still verify against history.
  }
  return true;
}

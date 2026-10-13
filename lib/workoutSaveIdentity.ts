import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";

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

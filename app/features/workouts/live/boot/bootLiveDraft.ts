import { supabase } from "@/lib/supabase";
import type { WorkoutLoadPayload, LiveWorkoutDraft } from "../state/types";
import { buildDraftFromBootstrap } from "../../hooks/buildDraft";
import { buildEmptyQuickStartDraft } from "../builders/buildEmptyQuickStartDraft";
import { loadLiveDraftForUser, saveLiveDraftForUser } from "../persist/local";
import { fetchServerDraft } from "../persist/server";

import { log } from "@/lib/logger";
import { isLiveDraftCompleted } from "@/lib/workoutSaveIdentity";

/**
 * Boot order:
 * 1) Server draft (if newer)
 * 2) Local draft
 * 3) RPC bootstrap -> build new draft (template workout)
 * 4) Empty quick start draft
 */
export async function bootLiveDraft(args: {
  userId: string;
  workoutId?: string;
  planWorkoutId?: string | null;
  preferServer?: boolean;
}): Promise<LiveWorkoutDraft> {
  const { userId, workoutId, planWorkoutId, preferServer = true } = args;

  const [localCandidate, serverCandidate] = await Promise.all([
    loadLiveDraftForUser(userId),
    preferServer ? fetchServerDraft(userId) : Promise.resolve(null),
  ]);

  // A save can commit even when clearing the server draft fails. Never hydrate
  // an already-completed draft as a new editable session: an idempotent retry
  // would silently discard any sets entered after that first save.
  const local =
    localCandidate && !(await isLiveDraftCompleted(localCandidate, userId))
      ? localCandidate
      : null;
  const server =
    serverCandidate && !(await isLiveDraftCompleted(serverCandidate, userId))
      ? serverCandidate
      : null;

  const hasLocal = !!local?.draftId;
  const hasServer = !!server?.draftId;

  const localUpdated =
    hasLocal && local?.updatedAt ? Date.parse(local.updatedAt) : 0;
  const serverUpdated =
    hasServer && server?.updatedAt ? Date.parse(server.updatedAt) : 0;

  log("bootLiveDraft", {
    preferServer,
    hasLocal,
    localUpdated: local?.updatedAt ?? null,
    hasServer,
    serverUpdated: server?.updatedAt ?? null,
    pick:
      hasServer && (!hasLocal || serverUpdated >= localUpdated)
        ? "server"
        : hasLocal
        ? "local"
        : workoutId
        ? "bootstrap"
        : "quick_start",
  });

  // 1) Server if newer (or local missing)
  if (hasServer && (!hasLocal || serverUpdated >= localUpdated)) {
    await saveLiveDraftForUser(userId, server!);
    return server!;
  }

  // 2) Local
  if (hasLocal) return local!;

  // 3) Bootstrap from saved workout template
  if (workoutId) {
    const { data, error } = await supabase.rpc("get_workout_session_bootstrap", {
      p_workout_id: workoutId,
      p_plan_workout_id: planWorkoutId ?? null,
    });
    if (error) throw error;

    const payload = data as WorkoutLoadPayload;
    const next = buildDraftFromBootstrap({ userId, payload });

    await saveLiveDraftForUser(userId, next);
    return next;
  }

  // 4) Quick Start
  const next = buildEmptyQuickStartDraft({ userId });

  await saveLiveDraftForUser(userId, next);
  return next;
}
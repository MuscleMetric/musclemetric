// Shared persistence boundary for both live-draft and legacy review saves.
// Payload construction stays pure in saveWorkout.ts.
import { supabase } from "./supabase";
import * as Sentry from "@sentry/react-native";
import { log } from "@/lib/logger";
import type { RpcWorkout, SaveResult } from "./saveWorkout";

type SaveSource = "live" | "review";
const DEBUG_SAVE = __DEV__;

function dlog(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_SAVE) return;
  log(`[saveWorkout] ${message}`, data ?? {});
}

function breadcrumb(message: string, data?: Record<string, unknown>) {
  Sentry.addBreadcrumb({
    category: "save_rpc",
    message,
    level: "info",
    data,
  });
}

function summarizePayload(payload: RpcWorkout) {
  let approxBytes = 0;
  try {
    approxBytes = JSON.stringify(payload).length;
  } catch {
    // Diagnostics must never prevent an attempted workout save.
  }

  return {
    client_save_id: payload.client_save_id,
    workout_id: payload.workout_id,
    completed_at: payload.completed_at,
    duration_seconds: payload.duration_seconds,
    plan_workout_id: payload.plan_workout_id,
    exerciseCount: payload.exercise_history.length,
    setCount: payload.exercise_history.reduce((total, ex) => total + ex.sets.length, 0),
    updateCount: payload.workout_exercise_updates.length,
    approxBytes,
  };
}

/**
 * Both workout entry points use the v2 RPC with the persisted originating
 * owner, never an owner derived from a fresh session read. The database checks
 * the owner against the actual request JWT before delegating to atomic v1.
 */
export async function saveRpcWorkout(
  payload: RpcWorkout,
  source: SaveSource,
  expectedOwnerUserId: string,
): Promise<SaveResult> {
  if (!expectedOwnerUserId) {
    throw new Error("Workout owner is missing. Please reopen the workout.");
  }
  const summary = summarizePayload(payload);
  dlog(source === "live" ? "payload summary" : "review payload summary", summary);
  breadcrumb("rpc start", summary);

  let reportedRpcFailure = false;

  try {
    const { data, error } = await supabase.rpc("save_completed_workout_v2", {
      p_workout: payload,
      p_expected_user_id: expectedOwnerUserId,
    });

    if (error) {
      breadcrumb("rpc error", {
        ...summary,
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });

      // Mark the error as reported so the catch block does not send it twice.
      reportedRpcFailure = true;
      Sentry.captureException(error, {
        tags: { area: "save_rpc", fn: "save_completed_workout_v2" },
        extra: {
          ...summary,
          code: error.code,
          details: error.details,
          hint: error.hint,
          message: error.message,
        },
      });

      throw new Error(error.message);
    }

    const workoutHistoryId = String(data);
    breadcrumb("rpc success", { ...summary, workoutHistoryId });
    if (source === "live") dlog("rpc success", { workoutHistoryId });
    return { workoutHistoryId };
  } catch (e: unknown) {
    const error = e as { name?: string; message?: string } | null;
    breadcrumb("rpc exception", {
      ...summary,
      message: String(error?.message ?? e),
    });

    if (!reportedRpcFailure && error?.name !== "PostgrestError") {
      Sentry.captureException(e, {
        tags: { area: "save_rpc", stage: "unexpected" },
        extra: summary,
      });
    }

    throw e;
  }
}

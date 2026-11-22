import { routeSlot } from "./workoutOutdoor";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";
import { supabase } from "@/lib/supabase";
import { saveRpcWorkout } from "@/lib/workoutSaveRpc";
import { RUN_TYPE_LABELS } from "@/app/features/cardio/tracking/types";
import { meters, routeExpired, splits, type Run } from "./runMetrics";
import { listRuns, readRun, serialize, writeRun } from "./runStore";

const iso = (ms: number) => new Date(ms).toISOString();
const seconds = (ms: number) => Math.round(ms / 1000);

async function checkpoint(owner: string, id: string, patch: Partial<Pick<Run, "historyId" | "routeSynced" | "workoutSaveRequested">>) {
  await serialize(async () => {
    const current = await readRun(owner, id);
    await writeRun({ ...current, ...patch });
  });
}

export async function prepareWorkoutRoutes(draft: LiveWorkoutDraft) {
  const ids = new Set(draft.exercises.flatMap(exercise => exercise.sets.map(set => set.gpsRecordingId).filter(Boolean)));
  for (const run of await listRuns(draft.userId)) {
    if (run.workoutSet?.draftId !== draft.draftId || run.historyId) continue;
    const include = ids.has(run.id);
    if (include !== !!run.workoutSaveRequested) {
      await checkpoint(draft.userId, run.id, { workoutSaveRequested: include });
    }
  }
}

export async function saveRunHistory(owner: string, id: string) {
  const run = await readRun(owner, id);
  if (run.end === null || run.historyId) return;
  if (run.workoutSet) {
    if (!run.workoutSaveRequested) return;
    const parent = await supabase.from("workout_history").select("id").eq("user_id", owner)
      .eq("client_save_id", run.workoutSet.draftId).maybeSingle();
    if (parent.error || !parent.data) throw Error("Workout save pending");
    await checkpoint(owner, id, { historyId: parent.data.id });
    return;
  }
  if (!run.type) return;
  const exercise = await supabase.from("exercises").select("id").eq("name", "Outdoor Run")
    .eq("type", "cardio").eq("is_public", true).single();
  if (exercise.error) throw Error("Outdoor Run unavailable");
  const time = Math.max(1, seconds(run.accumulatedMs));
  const { workoutHistoryId } = await saveRpcWorkout({
    client_save_id: run.id, workout_id: null, completed_at: iso(run.end), duration_seconds: time,
    notes: [RUN_TYPE_LABELS[run.type] + " outdoor run", run.effort ? "RPE " + run.effort + "/10" : null].filter(Boolean).join(" · "),
    exercise_history: [{ exercise_id: exercise.data.id, order_index: 0, notes: "", workout_exercise_id: "",
      is_dropset: false, superset_group: "", superset_index: "", sets: [{
        set_number: 1, drop_index: 0, reps: null, weight: null, distance: meters(run) / 1000,
        time_seconds: time, notes: null,
      }] }], workout_exercise_updates: [],
  }, "live", owner);
  await checkpoint(owner, id, { historyId: workoutHistoryId });
}

// Owner-only backup. Completed status is written after the final batch.
// Unique indices let a retry safely resend batches after a dropped response.
const uploads = new Map<string, Promise<void>>();

export function backupRoute(owner: string, id: string) {
  const key = owner + ":" + id;
  const existing = uploads.get(key);
  if (existing) return existing;
  const upload = uploadRoute(owner, id).finally(() => uploads.delete(key));
  uploads.set(key, upload);
  return upload;
}

export async function retryRunUploads(owner: string) {
  let pending = false;
  for (const run of await listRuns(owner)) {
    if ((!run.workoutSet || run.workoutSaveRequested) && run.autoBackup && run.end !== null && !run.routeSynced && (!routeExpired(run.start) || !run.historyId)) {
      try { await backupRoute(owner, run.id); } catch { pending = true; }
    }
  }
  return pending;
}

async function uploadRoute(owner: string, id: string) {
  await saveRunHistory(owner, id);
  const run = await readRun(owner, id);
  if (!run.historyId || run.end === null || (!run.type && !run.workoutSet) || run.routeSynced || routeExpired(run.start)) return;
  const header = { id, user_id: owner, workout_history_id: run.historyId,
    ...(run.workoutSet ? { workout_slot: routeSlot(run.workoutSet.exerciseId, run.workoutSet.orderIndex, run.workoutSet.setNumber) } : {}),
    source: "gps", status: "paused", started_at: iso(run.start) };
  const parent = await supabase.from("cardio_recordings").upsert(header, { onConflict: "id", ignoreDuplicates: true });
  if (parent.error) throw Error("Route backup unavailable");
  for (let first = 0; first < run.points.length; first += 200) {
    const rows = run.points.slice(first, first + 200).map((p, i) => ({
      recording_id: id, point_index: first + i, recorded_at: iso(p.time),
      elapsed_seconds: seconds(p.time - run.start), latitude: p.latitude,
      longitude: p.longitude, horizontal_accuracy_m: p.accuracy,
      leg_index: p.leg, active_ms: Math.round(p.activeMs), cumulative_meters: p.meters,
    }));
    const batch = await supabase.from("cardio_route_points").upsert(rows, { onConflict: "recording_id,point_index", ignoreDuplicates: true });
    if (batch.error) throw Error("Route backup incomplete");
  }
  const rows = splits(run).map((s, i) => ({
    recording_id: id, split_index: i + 1, distance_meters: s.distance,
    duration_seconds: Math.max(1, Math.round(s.seconds)), end_elapsed_seconds: Math.max(1, Math.round(s.endSeconds)),
    is_partial: s.partial, source: "gps",
  }));
  if (rows.length) {
    const batch = await supabase.from("cardio_splits").upsert(rows, { onConflict: "recording_id,split_index", ignoreDuplicates: true });
    if (batch.error) throw Error("Split backup incomplete");
  }
  const finish = await supabase.from("cardio_recordings").update({
    status: "completed", run_type: run.type, effort_rpe: run.effort, completed_at: iso(run.end),
    distance_meters: meters(run), elapsed_seconds: seconds(run.end - run.start), moving_seconds: seconds(run.accumulatedMs),
  }).eq("id", id).eq("user_id", owner).select("id").single();
  if (finish.error) throw Error("Route backup incomplete");
  await checkpoint(owner, id, { routeSynced: true });
}

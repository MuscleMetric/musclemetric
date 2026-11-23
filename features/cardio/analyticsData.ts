import { supabase } from "@/lib/supabase";
import { RUN_TYPES, type RunType } from "@/app/features/cardio/tracking/types";
import { meters, type Run } from "./runMetrics";

export type AnalyticsRun = Run & { sourceLabel?: "gps" | "logged" };
const validType = (value: unknown): RunType | null =>
  typeof value === "string" && (RUN_TYPES as readonly string[]).includes(value)
    ? value as RunType : null;

const finitePositive = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Include device runs and history-backed cardio. No GPS coordinates are fetched here.
 * Device and cloud copies of the same recording share an ID, so never double count.
 */
export async function loadAnalyticsRuns(owner: string, local: Run[] = []): Promise<AnalyticsRun[]> {
  const [recordings, history] = await Promise.all([
    supabase.from("cardio_recordings")
      .select("id,workout_history_id,started_at,completed_at,distance_meters,moving_seconds,run_type,source")
      .eq("user_id", owner).eq("status", "completed")
      .order("started_at", { ascending: false }).limit(1000),
    supabase.from("workout_history")
      .select("id,completed_at,workout_exercise_history(id,exercises(name,type),workout_set_history(id,distance,time_seconds))")
      .eq("user_id", owner).order("completed_at", { ascending: false }).limit(1000),
  ]);
  if (recordings.error) throw recordings.error;
  if (history.error) throw history.error;

  const completed = new Map<string, AnalyticsRun>();
  for (const run of local) {
    if (run.end !== null && finitePositive(meters(run)) && finitePositive(run.accumulatedMs)) {
      completed.set(run.id, { ...run, sourceLabel: "gps" });
    }
  }

  const gpsHistoryIds = new Set<string>();
  for (const run of completed.values()) if (run.historyId) gpsHistoryIds.add(run.historyId);
  for (const raw of recordings.data ?? []) {
    const row = raw as any;
    if (row.workout_history_id) gpsHistoryIds.add(row.workout_history_id);
    if (completed.has(row.id)) continue;
    const start = Date.parse(row.started_at);
    const end = Date.parse(row.completed_at);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const distance = finitePositive(row.distance_meters);
    const seconds = finitePositive(row.moving_seconds);
    if (!distance || !seconds) continue;
    completed.set(row.id, {
      version: 1, id: row.id, owner, start, end, activeSince: null,
      accumulatedMs: seconds * 1000, points: [], leg: 0, rejected: 0,
      type: validType(row.run_type), effort: null,
      historyId: row.workout_history_id ?? null, routeSynced: true,
      summaryMeters: distance, sourceLabel: row.source === "manual" ? "logged" : "gps",
    });
  }

  for (const raw of history.data ?? []) {
    const parent = raw as any;
    const date = Date.parse(parent.completed_at);
    if (!Number.isFinite(date)) continue;
    for (const exercise of parent.workout_exercise_history ?? []) {
      const name = String(exercise.exercises?.name ?? "");
      // Only actual running exercises are individual run records.
      if (!/(run|jog|treadmill)/i.test(name)) continue;
      // A backed-up GPS run is already represented by its recording.
      if (gpsHistoryIds.has(parent.id) && /outdoor run/i.test(name)) continue;
      const sets = exercise.workout_set_history ?? [];
      const distanceKm = sets.reduce((sum: number, set: any) => sum + finitePositive(set.distance), 0);
      const duration = sets.reduce((sum: number, set: any) => sum + finitePositive(set.time_seconds), 0);
      if (!distanceKm || !duration) continue;
      const id = "history:" + exercise.id;
      if (completed.has(id)) continue;
      completed.set(id, {
        version: 1, id, owner, start: date - duration * 1000, end: date,
        activeSince: null, accumulatedMs: duration * 1000, points: [],
        summaryMeters: distanceKm * 1000, leg: 0, rejected: 0, type: null,
        effort: null, historyId: parent.id, routeSynced: false, sourceLabel: "logged",
      });
    }
  }
  return [...completed.values()].sort((a, b) => b.start - a.start);
}

/** Prefer the logged set's distance; the recording is a fallback, not an extra run. */
export async function loadWeeklyDistance(owner: string, since: string) {
  const [history, recordings] = await Promise.all([
    supabase.from("workout_history")
      .select("id,completed_at,workout_exercise_history(workout_set_history(distance))")
      .eq("user_id", owner).gte("completed_at", since)
      .order("completed_at", { ascending: false }).limit(1000),
    supabase.from("cardio_recordings")
      .select("id,workout_history_id,completed_at,distance_meters")
      .eq("user_id", owner).eq("status", "completed")
      .gte("completed_at", since).limit(1000),
  ]);
  if (history.error) throw history.error;
  if (recordings.error) throw recordings.error;
  const byHistory = new Map<string, number>();
  const totals: { date: number; km: number }[] = [];
  for (const raw of history.data ?? []) {
    const row = raw as any;
    const km = (row.workout_exercise_history ?? []).reduce(
      (sum: number, exercise: any) => sum + (exercise.workout_set_history ?? []).reduce(
        (sets: number, set: any) => sets + finitePositive(set.distance), 0), 0);
    byHistory.set(row.id, km);
    if (km > 0) totals.push({ date: Date.parse(row.completed_at), km });
  }
  for (const raw of recordings.data ?? []) {
    const row = raw as any;
    const distance = finitePositive(row.distance_meters) / 1000;
    if (!distance || byHistory.get(row.workout_history_id) || !row.completed_at) continue;
    totals.push({ date: Date.parse(row.completed_at), km: distance });
  }
  return totals.filter(item => Number.isFinite(item.date));
}

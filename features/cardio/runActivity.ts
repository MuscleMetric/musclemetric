import * as Activity from "expo-live-activity";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { meters, type Run } from "./runMetrics";

// Smooth individual GPS fixes over at most 30 seconds of one continuous leg.
export function currentPace(run: Run, now: number): number | null {
  const points = run.points;
  const last = points[points.length - 1];
  if (run.activeSince === null || !last || last.leg !== run.leg || now - last.time > 30000) return null;
  let first = last;
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    if (p.leg !== last.leg || last.time - p.time > 30000) break;
    first = p;
  }
  const distance = last.meters - first.meters;
  return distance >= 10 && last.time - first.time >= 5000 ? (last.time - first.time) / distance : null;
}

export function refreshRunActivity(run: Run, mode: "start" | "control" | "gps") {
  const now = Date.now();
  if (mode === "gps" && (!run.activityId || now - (run.activityUpdatedAt ?? 0) < 5000)) return;
  const paused = run.activeSince === null;
  const state: Activity.LiveActivityState = {
    title: paused ? "Outdoor Run · Paused" : "Outdoor Run",
    subtitle: [(meters(run) / 1000).toFixed(2) + " km", cardioPace(currentPace(run, now)),
      run.accumulatedMs ? cardioTime(run.accumulatedMs / 1000) : "0:00"].join("\n"),
    // The run widget interprets this as the active clock's origin.
    progressBar: run.activeSince === null ? undefined : { date: run.activeSince - run.accumulatedMs },
  };
  try {
    if (run.activityId) {
      Activity.updateActivity(run.activityId, state);
    } else if (mode === "start") {
      run.activityId = Activity.startActivity(state, { deepLinkUrl: "features/cardio/outdoor-run" }) || undefined;
    }
    run.activityUpdatedAt = now;
  } catch {
    // Activities may be disabled or dismissed independently of GPS recording.
    run.activityId = undefined;
  }
}

export function endRunActivity(run: Run) {
  if (!run.activityId) return;
  try {
    Activity.stopActivity(run.activityId, { title: "Outdoor Run ended" });
  } catch {
    // The system or the runner may already have removed the activity.
  }
  run.activityId = undefined;
}

import type { RunType } from "@/app/features/cardio/tracking/types";
import { meters, runBest } from "./runMetrics";
import type { AnalyticsRun } from "./analyticsData";

export const DAY_MS = 86400000;
const positive = (n: number) => Number.isFinite(n) && n > 0;

/** A recorded GPS segment or a real logged finish at the requested distance. Never projected. */
export function measuredBest(run: AnalyticsRun, distance: number): number | null {
  const gps = runBest(run, distance);
  if (gps !== null && positive(gps)) return gps;
  const travelled = meters(run);
  const seconds = run.accumulatedMs / 1000;
  if (run.points.length === 0 && Math.abs(travelled - distance) <= distance * 0.01 && positive(seconds)) {
    return seconds;
  }
  return null;
}

/** Individual completed runs, chronological, including the 90th day. */
export function runGraphData(runs: AnalyticsRun[], category: RunType | null, now = Date.now()) {
  const cutoff = now - 90 * DAY_MS;
  return runs.filter(run => run.end !== null && run.start >= cutoff && run.start <= now &&
    (!category || run.type === category) && positive(meters(run)) &&
    positive(run.accumulatedMs))
    .sort((a, b) => a.start - b.start);
}

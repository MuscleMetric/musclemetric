import { measuredBest, runGraphData, DAY_MS } from "@/features/cardio/analyticsMetrics";
import type { AnalyticsRun } from "@/features/cardio/analyticsData";

const now = Date.UTC(2026, 10, 23, 20);
function run(id: string, start: number, distance: number, seconds: number,
  type: AnalyticsRun["type"] = "easy", ended = true): AnalyticsRun {
  return {
    version: 1, id, owner: "tester", start, end: ended ? start + seconds * 1000 : null,
    activeSince: null, accumulatedMs: seconds * 1000, points: [],
    summaryMeters: distance, rejected: 0, leg: 0, type, effort: null,
    historyId: id, routeSynced: false, sourceLabel: "logged",
  };
}

test("90-day run graph keeps every eligible session chronologically and excludes incomplete data", () => {
  const results = runGraphData([
    run("recent", now - DAY_MS, 5000, 1400),
    run("cutoff", now - 90 * DAY_MS, 3000, 920),
    run("old", now - 90 * DAY_MS - 1, 5000, 1400),
    run("future", now + 1, 5000, 1400),
    run("paused", now - DAY_MS, 6000, 1900, "easy", false),
    run("zero", now - DAY_MS, 0, 500),
    run("tempo", now - 4 * DAY_MS, 6000, 1600, "tempo"),
  ], null, now);
  expect(results.map(r => r.id)).toEqual(["cutoff", "tempo", "recent"]);
  expect(runGraphData(results, "easy", now).map(r => r.id)).toEqual(["cutoff", "recent"]);
});

test("records real logged results without inventing a five-kilometre split for longer runs", () => {
  const exact = run("5k", now - DAY_MS, 5000, 1234);
  expect(measuredBest(exact, 5000)).toBe(1234);
  expect(measuredBest(exact, 1000)).toBeNull();
  expect(measuredBest(run("6k", now - DAY_MS, 6000, 1450), 5000)).toBeNull();
});

test("honours stored GPS subdistance records even after detailed route expiry", () => {
  const previous = run("gps", now - 120 * DAY_MS, 9000, 3600);
  previous.sourceLabel = "gps";
  previous.bestSeconds = { 1000: 235, 5000: 1390 };
  expect(measuredBest(previous, 5000)).toBe(1390);
  expect(measuredBest(previous, 10000)).toBeNull();
});

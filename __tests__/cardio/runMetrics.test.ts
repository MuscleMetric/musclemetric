import { activeMs, appendFixes, bestSegment, legs, meters, splits, type Fix, type Run } from "@/features/cardio/runMetrics";

export function draft(): Run {
  return { version: 1, id: "id", owner: "owner", start: 0, end: null, activeSince: 0, accumulatedMs: 0,
    type: null, effort: null, historyId: null, routeSynced: false, rejected: 0, leg: 1, points: [] };
}
const fix = (distance: number, time: number, accuracy = 5): Fix => ({
  latitude: 0, longitude: distance / 6371000 * 180 / Math.PI, accuracy, time,
});

test("crosses real kilometre boundaries and keeps a partial final split", () => {
  const run = draft();
  const fixes = Array.from({ length: 26 }, (_, i) => fix(i * 50, i * 10000));
  appendFixes(run, fixes.reverse(), 250000);
  expect(meters(run)).toBeCloseTo(1250);
  expect(splits(run)).toHaveLength(2);
  expect(splits(run)[0].seconds).toBeCloseTo(200);
  expect(splits(run)[1].distance).toBeCloseTo(250);
  expect(splits(run)[1].partial).toBe(true);
  expect(bestSegment(run.points, 1000)).toBeCloseTo(200);
  expect(bestSegment(run.points, 5000)).toBeNull();
});

test("drops imprecise, impossible, future and replayed locations", () => {
  const run = draft();
  appendFixes(run, [fix(0, 0), fix(9999, 1000), fix(100, 2000, 90), fix(10, 3000), fix(20, 9000)], 3000);
  appendFixes(run, [fix(10, 3000)], 3000);
  expect(run.points).toHaveLength(2);
  expect(run.rejected).toBe(2);
  expect(meters(run)).toBeCloseTo(10);
});

test("pause, poor signal and relaunch do not bridge missing route or award a continuous PB", () => {
  const run = draft();
  appendFixes(run, [fix(0, 0), fix(60, 10000)], 10000);
  run.accumulatedMs = 10000;
  run.activeSince = null;
  appendFixes(run, [fix(500, 15000)], 15000);
  expect(activeMs(run, 100000)).toBe(10000);
  run.leg++;
  run.activeSince = 100000;
  appendFixes(run, [fix(600, 100000), fix(660, 110000), fix(1900, 190000), fix(1960, 200000)], 200000);
  expect(meters(run)).toBeCloseTo(180);
  expect(legs(run.points)).toHaveLength(3);
  expect(bestSegment(run.points, 100)).toBeNull();
  expect(bestSegment(run.points, 50)).toBeCloseTo(8.333, 2);
});

test("finds a faster subdistance inside a varied-pace run", () => {
  const run = draft();
  const fixes = Array.from({ length: 31 }, (_, i) => fix(i * 50, i <= 10 ? i * 15000 : 150000 + (i - 10) * 7000));
  appendFixes(run, fixes, 300000);
  expect(bestSegment(run.points, 1000)).toBeCloseTo(140);
  expect(splits(run)[0].seconds).toBeCloseTo(220);
});

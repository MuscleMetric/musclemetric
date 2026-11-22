import type { RunType } from "@/app/features/cardio/tracking/types";

export type Fix = { latitude: number; longitude: number; accuracy: number; time: number };
export type Point = Fix & { leg: number; meters: number; activeMs: number };
export type Run = {
  version: 1;
  activityId?: string;
  activityUpdatedAt?: number;
  id: string;
  owner: string;
  start: number;
  end: number | null;
  activeSince: number | null;
  accumulatedMs: number;
  leg: number;
  points: Point[];
  rejected: number;
  type: RunType | null;
  effort: number | null;
  historyId: string | null;
  routeSynced: boolean;
};

export function activeMs(run: Run, now: number) {
  return run.accumulatedMs + (run.activeSince === null ? 0 : Math.max(0, now - run.activeSince));
}

export function meters(run: Run) {
  return run.points[run.points.length - 1]?.meters ?? 0;
}

function separation(a: Fix, b: Fix) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) *
    Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Samples are timestamped by Core Location. Never bridge a pause or a GPS outage.
export function appendFixes(run: Run, fixes: Fix[], receivedAt: number) {
  if (run.activeSince === null || run.end !== null) return;
  for (const fix of [...fixes].sort((a, b) => a.time - b.time)) {
    const prev = run.points[run.points.length - 1];
    if (!Number.isFinite(fix.time) || fix.time < run.activeSince || fix.time > receivedAt + 1000 ||
        (prev && fix.time <= prev.time)) continue;
    if (![fix.latitude, fix.longitude, fix.accuracy].every(Number.isFinite) ||
        Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180 ||
        fix.accuracy < 0 || fix.accuracy > 35) {
      run.rejected++;
      continue;
    }
    if (prev && prev.leg === run.leg && fix.time - prev.time > 30000) run.leg++;
    let step = 0;
    if (prev && prev.leg === run.leg) {
      step = separation(prev, fix);
      if (step > 12 * (fix.time - prev.time) / 1000) {
        run.rejected++;
        continue;
      }
    }
    run.points.push({ ...fix, leg: run.leg, meters: (prev?.meters ?? 0) + step, activeMs: activeMs(run, fix.time) });
  }
}

export function legs(points: Point[]) {
  const result: Point[][] = [];
  for (const point of points) {
    if (result[result.length - 1]?.[0].leg !== point.leg) result.push([]);
    result[result.length - 1].push(point);
  }
  return result;
}

export function splits(run: Run) {
  const result: { distance: number; seconds: number; endSeconds: number; partial: boolean }[] = [];
  let boundary = 1000;
  let previousMs = 0;
  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1], b = run.points[i];
    while (a.meters < boundary && b.meters >= boundary) {
      const fraction = (boundary - a.meters) / (b.meters - a.meters);
      const time = a.activeMs + fraction * (b.activeMs - a.activeMs);
      result.push({ distance: 1000, seconds: (time - previousMs) / 1000,
        endSeconds: (a.time + fraction * (b.time - a.time) - run.start) / 1000, partial: false });
      previousMs = time;
      boundary += 1000;
    }
  }
  const remaining = meters(run) - result.length * 1000;
  const last = run.points[run.points.length - 1];
  if (last && remaining >= 0.01) {
    const end = run.end ?? last.time;
    const time = run.end === null ? last.activeMs : run.accumulatedMs;
    result.push({ distance: remaining, seconds: (time - previousMs) / 1000, endSeconds: (end - run.start) / 1000, partial: true });
  }
  return result;
}

export const benchmarks = [1000, 5000, 10000, 21097.5, 42195] as const;

// Test both endpoint families. The fastest interpolated window on a
// piecewise-linear distance trace has a recorded sample at one end.
export function bestSegment(points: Point[], distance: number): number | null {
  let best = Infinity;
  for (const leg of legs(points)) {
    let right = 1;
    let left = 0;
    for (let i = 0; i < leg.length; i++) {
      const p = leg[i];
      const target = p.meters + distance;
      while (right < leg.length && leg[right].meters < target) right++;
      if (right < leg.length) {
        const a = leg[right - 1], b = leg[right];
        const end = a.time + (target - a.meters) / (b.meters - a.meters) * (b.time - a.time);
        best = Math.min(best, end - p.time);
      }
      const start = p.meters - distance;
      if (start < leg[0].meters) continue;
      while (left + 1 < i && leg[left + 1].meters <= start) left++;
      const a = leg[left], b = leg[left + 1];
      const begin = a.time + (start - a.meters) / (b.meters - a.meters) * (b.time - a.time);
      best = Math.min(best, p.time - begin);
    }
  }
  return Number.isFinite(best) ? best / 1000 : null;
}

export function personalBestsForRun(run: Run, history: Run[]) {
  const earlier = history.filter(r => r.end !== null && r.start < run.start);
  return benchmarks.flatMap(distance => {
    const time = bestSegment(run.points, distance);
    if (time === null || earlier.some(r => {
      const previous = bestSegment(r.points, distance);
      return previous !== null && previous <= time;
    })) return [];
    return [{ distance, time }];
  });
}

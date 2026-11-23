import { supabase } from "@/lib/supabase";
import { loadAnalyticsRuns, loadWeeklyDistance } from "@/features/cardio/analyticsData";
import type { Run } from "@/features/cardio/runMetrics";

jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));

function chain(data: unknown[]) {
  const q: any = {};
  for (const method of ["select", "eq", "gte", "order"]) q[method] = jest.fn(() => q);
  q.limit = jest.fn(async () => ({ data, error: null }));
  return q;
}
const from = supabase.from as unknown as jest.Mock;
const date = "2026-11-20T12:00:00.000Z";

beforeEach(() => from.mockReset());

test("distance totals use workout sets once, with GPS as a fallback only", async () => {
  const history = [
    { id: "a", completed_at: date, workout_exercise_history: [{ workout_set_history: [{ distance: 5 }] }] },
    { id: "b", completed_at: date, workout_exercise_history: [] },
  ];
  const recordings = [
    { id: "gps-a", workout_history_id: "a", completed_at: date, distance_meters: 5000 },
    { id: "gps-b", workout_history_id: "b", completed_at: date, distance_meters: 2500 },
  ];
  from.mockImplementation((table: string) => chain(table === "workout_history" ? history : recordings));
  const result = await loadWeeklyDistance("owner", "2026-11-01T00:00:00Z");
  expect(result.map(x => x.km)).toEqual([5, 2.5]);
});

test("run history merges an iPhone recording once and includes separate manually logged runs", async () => {
  const device: Run = { version: 1, id: "gps-a", owner: "owner",
    start: Date.parse(date) - 1800000, end: Date.parse(date), accumulatedMs: 1800000,
    activeSince: null, points: [], summaryMeters: 5000, leg: 0, rejected: 0, type: "tempo",
    effort: null, historyId: "a", routeSynced: true };
  const gps = [{ id: "gps-a", workout_history_id: "a", started_at: date, completed_at: date,
    distance_meters: 5000, moving_seconds: 1800, source: "gps", run_type: "tempo" }];
  const history = [
    { id: "a", completed_at: date, workout_exercise_history: [
      { id: "exercise-a", exercises: { name: "Outdoor Run" },
        workout_set_history: [{ id: "set-a", distance: 5, time_seconds: 1800 }] }] },
    { id: "b", completed_at: date, workout_exercise_history: [
      { id: "exercise-b", exercises: { name: "Treadmill Run" },
        workout_set_history: [{ id: "set-b", distance: 4, time_seconds: 1600 }] }] },
  ];
  from.mockImplementation((table: string) => chain(table === "workout_history" ? history : gps));
  const result = await loadAnalyticsRuns("owner", [device]);
  expect(result.map(r => r.id).sort()).toEqual(["gps-a", "history:exercise-b"]);
  expect(result.find(r => r.id === "history:exercise-b")?.summaryMeters).toBe(4000);
});

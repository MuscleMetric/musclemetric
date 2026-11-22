import { supabase } from "@/lib/supabase";
import { saveRpcWorkout } from "@/lib/workoutSaveRpc";
import { readRun, writeRun } from "@/features/cardio/runStore";
import { backupRoute, saveRunHistory } from "@/features/cardio/syncRun";
import type { Run } from "@/features/cardio/runMetrics";

jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/lib/workoutSaveRpc", () => ({ saveRpcWorkout: jest.fn() }));
jest.mock("@/features/cardio/runStore", () => ({
  readRun: jest.fn(), writeRun: jest.fn(), serialize: (op: () => unknown) => op(),
}));
let run: Run;
let failPoints = false;
let batches: unknown[] = [];
beforeEach(() => {
  batches = [];
  failPoints = false;
  run = {
    version: 1, owner: "a", id: "stable-id", start: Date.now() - 11000, end: Date.now(), activeSince: null, accumulatedMs: 10000,
    type: "easy", effort: null, leg: 1, rejected: 0, historyId: null, routeSynced: false,
    points: [0, 1].map(i => ({ time: i * 10000, latitude: 50, longitude: -0.1, accuracy: 5, leg: 1, activeMs: i * 10000, meters: i * 40 })),
  };
  jest.mocked(readRun).mockImplementation(async () => ({ ...run }));
  jest.mocked(writeRun).mockImplementation(async r => { run = r; });
  jest.mocked(saveRpcWorkout).mockResolvedValue({ workoutHistoryId: "history" });
  (supabase.from as jest.Mock).mockImplementation(table => {
    const query = { select: () => query, eq: () => query, single: () => ({ data: { id: "exercise" }, error: null }),
      update: () => query,
      upsert: async (values: unknown) => {
        if (table === "cardio_route_points") batches.push(values);
        return { error: table === "cardio_route_points" && failPoints ? {} : null };
      },
    };
    return query;
  });
});
test("ordinary history contains no coordinates and does not require the GPS tables", async () => {
  await saveRunHistory("a", run.id);
  const [payload, , owner] = jest.mocked(saveRpcWorkout).mock.calls[0];
  expect(owner).toBe("a");
  expect(payload.client_save_id).toBe(run.id);
  expect(payload.exercise_history[0].sets[0]).toMatchObject({ distance: 0.04, time_seconds: 10 });
  expect(JSON.stringify(payload)).not.toMatch(/latitude|longitude|route_points/);
  expect(supabase.from).toHaveBeenCalledTimes(1);
  await saveRunHistory("a", run.id);
  expect(saveRpcWorkout).toHaveBeenCalledTimes(1);
});
test("failed private backup preserves local points and retries the same batch without duplicating history", async () => {
  failPoints = true;
  await expect(backupRoute("a", run.id)).rejects.toThrow();
  expect(run).toMatchObject({ historyId: "history", routeSynced: false });
  expect(run.points).toHaveLength(2);
  failPoints = false;
  await backupRoute("a", run.id);
  expect(run.routeSynced).toBe(true);
  expect(batches[1]).toEqual(batches[0]);
  expect(saveRpcWorkout).toHaveBeenCalledTimes(1);
});

test("an overdue offline run still saves workout totals without uploading GPS", async () => {
  run.start = Date.now() - 90 * 86400000;
  await backupRoute("a", run.id);
  expect(run.historyId).toBe("history");
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(run.routeSynced).toBe(false);
});

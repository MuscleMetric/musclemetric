import Storage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { finishRecorder, pauseRecorder, reconcileRecorder, startRecorder } from "@/features/cardio/recorder";
import { listRuns, readRun } from "@/features/cardio/runStore";

type Delivery = (event: unknown) => Promise<void>;
let mockDeliver: Delivery;
jest.mock("expo-task-manager", () => ({
  isTaskDefined: () => false, defineTask: (_: string, fn: Delivery) => { mockDeliver = fn; },
}));
jest.mock("expo-location", () => ({
  hasServicesEnabledAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn(), requestBackgroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(), stopLocationUpdatesAsync: jest.fn(), hasStartedLocationUpdatesAsync: jest.fn(),
  ActivityType: { Fitness: 1 }, Accuracy: { Highest: 1 },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "stable-run-id" }));
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn(), getAllKeys: jest.fn(), removeItem: jest.fn() }));
const memory = new Map<string, string>();
let on = false;
beforeEach(() => {
  memory.clear();
  on = false;
  jest.mocked(Storage.getItem).mockImplementation(async k => memory.get(k) ?? null);
  jest.mocked(Storage.setItem).mockImplementation(async (k, v) => { memory.set(k, v); });
  jest.mocked(Storage.getAllKeys).mockImplementation(async () => [...memory.keys()]);
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  jest.mocked(Location.hasStartedLocationUpdatesAsync).mockImplementation(async () => on);
  jest.mocked(Location.startLocationUpdatesAsync).mockImplementation(async () => { on = true; });
  jest.mocked(Location.stopLocationUpdatesAsync).mockImplementation(async () => { on = false; });
  jest.useFakeTimers().setSystemTime(100000);
});
afterEach(() => { jest.useRealTimers(); });
async function deliver(t: number, lon: number) {
  jest.setSystemTime(t);
  await mockDeliver({ data: { locations: [{ timestamp: t, coords: { latitude: 0, longitude: lon, accuracy: 5 } }] } });
}
test("records offline, pauses on account switch and recovers under the original owner", async () => {
  await reconcileRecorder("a");
  await startRecorder("a");
  await deliver(100000, 0);
  await deliver(110000, 0.0004);
  await reconcileRecorder("b");
  expect(await listRuns("b")).toEqual([]);
  expect(on).toBe(false);
  await deliver(120000, 0.0008);
  const run = (await listRuns("a"))[0];
  expect(run.points).toHaveLength(2);
  expect(run.activeSince).toBeNull();
  await expect(startRecorder("a", run.id)).rejects.toThrow();
  await reconcileRecorder("a");
  await startRecorder("a", run.id);
  await pauseRecorder("a", run.id);
  await expect(finishRecorder("a", run.id, "easy", 11)).rejects.toThrow();
  await finishRecorder("a", run.id, "easy", null);
  expect(await readRun("a", run.id)).toMatchObject({ type: "easy", effort: null, end: 120000 });
});
test("denied background permission creates no draft", async () => {
  jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
  await reconcileRecorder("a");
  await expect(startRecorder("a")).rejects.toThrow("Always");
  expect(await listRuns("a")).toEqual([]);
});
test("interrupted native tracking restores a paused draft at the last fix", async () => {
  await reconcileRecorder("a");
  await startRecorder("a");
  await deliver(105000, 0);
  on = false;
  jest.setSystemTime(200000);
  await reconcileRecorder("a");
  expect((await listRuns("a"))[0]).toMatchObject({ accumulatedMs: 5000, activeSince: null });
});

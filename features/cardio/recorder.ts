import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { RUN_TYPES, type RunType } from "@/app/features/cardio/tracking/types";
import { appendFixes, meters } from "./runMetrics";
import { currentRecorder, makeRun, pauseClock, readRun, serialize, setRecorder, writeRun } from "./runStore";

const task = "musclemetric.private-outdoor-run.v1";

// Undefined during a headless background launch. A known signed-out state is null.
let foregroundOwner: string | null | undefined;

export class RunActionError extends Error {}

async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(task)) await Location.stopLocationUpdatesAsync(task);
}

if (Platform.OS === "ios" && !TaskManager.isTaskDefined(task)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(task, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await serialize(async () => {
      const run = await currentRecorder();
      if (!run || run.activeSince === null || run.end !== null ||
          (foregroundOwner !== undefined && foregroundOwner !== run.owner)) return;
      const fixes = data.locations.map(({ timestamp, coords }) => ({
        time: timestamp, latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? -1,
      }));
      appendFixes(run, fixes, Date.now());
      await writeRun(run);
    });
  });
}

// Reconcile on sign-in changes and foreground. A terminated native task leaves a
// recoverable paused draft; the time after its last sample is unknown.
export function reconcileRecorder(owner: string | null) {
  foregroundOwner = owner;
  return serialize(async () => {
    if (Platform.OS !== "ios") return;
    const run = await currentRecorder();
    if (!run || run.activeSince === null || run.end !== null) {
      await stopUpdates();
      return;
    }
    if (run.owner !== owner || !(await Location.hasStartedLocationUpdatesAsync(task))) {
      const last = run.points.at(-1)?.time ?? run.activeSince;
      pauseClock(run, Math.max(run.activeSince, last));
      await writeRun(run);
      await stopUpdates();
    }
  });
}

export async function startRecorder(owner: string, id?: string) {
  if (Platform.OS !== "ios") throw new RunActionError("Outdoor tracking requires an iPhone.");
  if (!(await Location.hasServicesEnabledAsync())) throw new RunActionError("Turn on Location Services in Settings to start GPS.");
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new RunActionError("Enable Precise Location for MuscleMetric in Settings to record distance.");
  }
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) {
    throw new RunActionError("Choose Always in location settings so the run continues with the screen locked.");
  }
  return serialize(async () => {
    if (foregroundOwner !== owner) throw new RunActionError("Sign in again to start your run.");
    const current = await currentRecorder();
    if (current && current.activeSince !== null) throw new RunActionError("A run is already recording.");
    const run = id ? await readRun(owner, id) : await makeRun(owner);
    if (run.end !== null) throw new RunActionError("This run has finished.");
    run.leg++;
    run.activeSince = Date.now();
    await writeRun(run);
    try {
      await setRecorder(run);
      await Location.startLocationUpdatesAsync(task, {
        accuracy: Location.Accuracy.Highest, distanceInterval: 5,
        activityType: Location.ActivityType.Fitness, pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
    } catch {
      pauseClock(run, run.activeSince);
      await writeRun(run);
      throw new RunActionError("GPS could not start. Check location settings and tap Resume.");
    }
  });
}

export function pauseRecorder(owner: string, id: string) {
  return serialize(async () => {
    const run = await readRun(owner, id);
    if (run.activeSince === null) return;
    pauseClock(run, Date.now());
    await writeRun(run);
    await stopUpdates();
  });
}

export function finishRecorder(owner: string, id: string, type: RunType, effort: number | null) {
  return serialize(async () => {
    const run = await readRun(owner, id);
    if (run.end !== null) return;
    if (!RUN_TYPES.includes(type)) throw new RunActionError("Choose a run type before finishing.");
    if (run.activeSince !== null || meters(run) <= 0) throw new RunActionError("Pause after recording some distance to finish.");
    if (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) throw new RunActionError("Effort must be between 1 and 10.");
    run.type = type;
    run.effort = effort;
    run.end = Date.now();
    await writeRun(run);
  });
}

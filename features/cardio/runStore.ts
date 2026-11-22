import Storage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { activeMs, type Run } from "./runMetrics";

const prefix = "mm:gps:v1:";
const pointer = "mm:gps:running";
const keyFor = (owner: string, id: string) => prefix + owner + ":" + id;
const listeners = new Set<() => void>();
let pending: Promise<unknown> = Promise.resolve();

// Background deliveries and foreground controls must observe each other's writes.
export function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}
export function subscribeRuns(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function read(key: string): Promise<Run | null> {
  const value = await Storage.getItem(key);
  if (!value) return null;
  const run: Run = JSON.parse(value);
  if (run.version !== 1 || keyFor(run.owner, run.id) !== key) throw Error("Invalid run draft");
  return run;
}

export async function listRuns(owner: string) {
  const keys = (await Storage.getAllKeys()).filter(k => k.startsWith(prefix + owner + ":"));
  const runs = await Promise.all(keys.map(read));
  return runs.filter((run): run is Run => !!run).sort((a, b) => b.start - a.start);
}

export async function readRun(owner: string, id: string) {
  const run = await read(keyFor(owner, id));
  if (!run) throw Error("Run unavailable");
  return run;
}

export async function currentRecorder() {
  const key = await Storage.getItem(pointer);
  return key ? read(key) : null;
}

export async function writeRun(run: Run) {
  await Storage.setItem(keyFor(run.owner, run.id), JSON.stringify(run));
  listeners.forEach(listener => listener());
}

export async function makeRun(owner: string): Promise<Run> {
  if ((await listRuns(owner)).some(run => run.end === null)) throw Error("Finish your current run first.");
  const now = Date.now();
  return { id: randomUUID(), owner, version: 1, start: now, end: null, type: null, effort: null,
    leg: 0, accumulatedMs: 0, activeSince: null, points: [], rejected: 0, historyId: null, routeSynced: false };
}

export async function setRecorder(run: Run) {
  await Storage.setItem(pointer, keyFor(run.owner, run.id));
}

export function pauseClock(run: Run, now: number) {
  run.accumulatedMs = activeMs(run, now);
  run.activeSince = null;
}

export async function discardDraft(owner: string, id: string) {
  return serialize(async () => {
    const run = await readRun(owner, id);
    if (run.activeSince !== null || run.end !== null) throw Error("Pause the run before discarding.");
    await Storage.removeItem(keyFor(owner, id));
    listeners.forEach(listener => listener());
  });
}

// Pending saves from the legacy review flow. The current live-workout screen
// saves directly and does not enqueue here.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { saveCompletedWorkoutFromReviewPayload } from "./saveWorkout";
import type { ReviewPayload } from "./sessionStore";
import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/react-native";

function bc(message: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({
    category: "pending_sync",
    message,
    level: "info",
    data,
  });
}

// Unowned jobs written by old builds cannot be attributed safely. Preserve
// this legacy key without automatically uploading or deleting its contents.
const LEGACY_KEY = "mm_pending_workout_saves_v1";
const USER_QUEUE_PREFIX = "mm_pending_workout_saves_v2:";
const userQueueKey = (userId: string) => `${USER_QUEUE_PREFIX}${userId}`;

export type PendingWorkoutJob = {
  ownerUserId: string;
  clientSaveId: string;
  createdAtIso: string;
  payload: ReviewPayload;
  totalDurationSec: number;
  completedAtIso: string;
  planWorkoutIdToComplete?: string | null;
  attempts: number;
  lastError?: string | null;
};

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify(count: number) {
  listeners.forEach((listener) => listener(count));
}

export function subscribePendingCount(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Serialize queue read-modify-write operations, including the sync pass.
// Otherwise a new enqueue while a save is in flight can be overwritten by the
// sync's final write. A rejected operation must not poison future operations.
let queueTail: Promise<void> = Promise.resolve();

async function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = queueTail;
  let release!: () => void;
  queueTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function readQueue(key: string): Promise<PendingWorkoutJob[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];

  // Do not silently erase a corrupted queue by replacing it with [].
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid stored workout save queue");
  }
  return parsed as PendingWorkoutJob[];
}

async function writeQueue(userId: string, jobs: PendingWorkoutJob[]) {
  await AsyncStorage.setItem(userQueueKey(userId), JSON.stringify(jobs));
  notify(jobs.length);
}

async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user?.id ?? null;
}

export async function getPendingCount(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  return (await readQueue(userQueueKey(userId))).filter(
    (job) => job.ownerUserId === userId,
  ).length;
}

// For support/recovery tooling only. Legacy jobs are left untouched because
// they contain no owner ID; do not infer an owner from the currently signed-in user.
export async function getLegacyPendingCount(): Promise<number> {
  const jobs = await readQueue(LEGACY_KEY);
  return jobs.length;
}

export async function enqueuePendingWorkout(input: {
  payload: ReviewPayload;
  totalDurationSec: number;
  completedAt: Date;
  planWorkoutIdToComplete?: string;
}): Promise<PendingWorkoutJob> {
  return withQueueLock(async () => {
    const ownerUserId = await currentUserId();
    if (!ownerUserId) {
      throw new Error("Cannot queue a workout without a signed-in account");
    }

    const job: PendingWorkoutJob = {
      ownerUserId,
      clientSaveId: uuidv4(),
      createdAtIso: new Date().toISOString(),
      payload: input.payload,
      totalDurationSec: input.totalDurationSec,
      completedAtIso: input.completedAt.toISOString(),
      planWorkoutIdToComplete: input.planWorkoutIdToComplete ?? null,
      attempts: 0,
      lastError: null,
    };

    bc("enqueue start", {
      clientSaveId: job.clientSaveId,
      ownerUserId,
      workoutId: input.payload?.workout?.id,
    });

    const queue = await readQueue(userQueueKey(ownerUserId));
    queue.push(job);
    await writeQueue(ownerUserId, queue);

    bc("enqueue success", {
      clientSaveId: job.clientSaveId,
      queueLength: queue.length,
    });
    return job;
  });
}

function isAuthProblem(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("jwt") ||
    m.includes("token") ||
    m.includes("auth") ||
    m.includes("not authenticated") ||
    m.includes("session")
  );
}

function isNetworkProblem(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("timeout") ||
    m.includes("socket") ||
    m.includes("offline")
  );
}

export async function syncPendingWorkouts(): Promise<{
  synced: number;
  remaining: number;
  stoppedBecauseAuth: boolean;
}> {
  return withQueueLock(async () => {
    bc("sync start");
    const userId = await currentUserId();
    if (!userId) {
      bc("sync stopped: no session");
      return { synced: 0, remaining: 0, stoppedBecauseAuth: true };
    }

    const queue = await readQueue(userQueueKey(userId));
    if (!queue.length) {
      return { synced: 0, remaining: 0, stoppedBecauseAuth: false };
    }

    let synced = 0;
    let stoppedBecauseAuth = false;
    const remaining: PendingWorkoutJob[] = [];

    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];

      // Defense in depth even if an old/malformed job lands in the wrong key.
      // Never guess ownership for jobs without an owner.
      if (job.ownerUserId !== userId) {
        remaining.push(job);
        continue;
      }

      // Fast client-side check. The v2 database RPC performs the authoritative
      // account check using the JWT attached to the actual upload request.
      if ((await currentUserId()) !== userId) {
        stoppedBecauseAuth = true;
        remaining.push(...queue.slice(i));
        break;
      }

      try {
        bc("job start", {
          clientSaveId: job.clientSaveId,
          ownerUserId: job.ownerUserId,
          attempts: job.attempts,
        });

        await saveCompletedWorkoutFromReviewPayload({
          clientSaveId: job.clientSaveId,
          ownerUserId: job.ownerUserId,
          payload: job.payload,
          totalDurationSec: job.totalDurationSec,
          completedAt: new Date(job.completedAtIso),
          planWorkoutIdToComplete: job.planWorkoutIdToComplete ?? undefined,
        });

        bc("job success", { clientSaveId: job.clientSaveId });
        synced += 1;
      } catch (e: any) {
        const msg = String(e?.message ?? "unknown");
        const authProblem = isAuthProblem(msg);
        const networkProblem = isNetworkProblem(msg);

        bc("job failed", {
          clientSaveId: job.clientSaveId,
          attemptsNext: job.attempts + 1,
          authProblem,
          networkProblem,
        });

        if ((job.attempts ?? 0) < 2) {
          Sentry.captureException(e, {
            tags: {
              area: "pending_sync",
              stage: "saveCompletedWorkout",
              auth_problem: String(authProblem),
              network_problem: String(networkProblem),
            },
            extra: {
              clientSaveId: job.clientSaveId,
              attempts: job.attempts,
              lastError: msg,
            },
          });
        }

        remaining.push({
          ...job,
          attempts: (job.attempts ?? 0) + 1,
          lastError: msg,
        });

        if (authProblem || networkProblem) {
          stoppedBecauseAuth = authProblem;
          remaining.push(...queue.slice(i + 1));
          break;
        }
      }
    }

    await writeQueue(userId, remaining);
    bc("sync end", { synced, remaining: remaining.length, stoppedBecauseAuth });
    return { synced, remaining: remaining.length, stoppedBecauseAuth };
  });
}

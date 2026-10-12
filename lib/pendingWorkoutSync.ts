// lib/pendingWorkoutSync.ts
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

const KEY = "mm_pending_workout_saves_v1";

export type PendingWorkoutJob = {
  clientSaveId: string; // uuid string
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
  listeners.forEach((l) => l(count));
}

export function subscribePendingCount(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function readQueue(): Promise<PendingWorkoutJob[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingWorkoutJob[]) : [];
  } catch {
    // If storage got corrupted, don't crash the app
    return [];
  }
}

async function writeQueue(q: PendingWorkoutJob[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
  notify(q.length);
}

export async function getPendingCount(): Promise<number> {
  const q = await readQueue();
  return q.length;
}

export async function enqueuePendingWorkout(input: {
  payload: ReviewPayload;
  totalDurationSec: number;
  completedAt: Date;
  planWorkoutIdToComplete?: string;
}): Promise<PendingWorkoutJob> {
  const job: PendingWorkoutJob = {
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
    totalDurationSec: job.totalDurationSec,
    planWorkoutIdToComplete: job.planWorkoutIdToComplete,
    workoutId: input.payload?.workout?.id,
    title: input.payload?.workout?.title,
  });

  const q = await readQueue();
  q.push(job);
  await writeQueue(q);

  bc("enqueue success", {
    clientSaveId: job.clientSaveId,
    queueLength: q.length,
  });

  return job;
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

/**
 * Tries to upload pending jobs in FIFO order.
 * Returns a summary so UI can show "synced X" etc if you want.
 */
export async function syncPendingWorkouts(): Promise<{
  synced: number;
  remaining: number;
  stoppedBecauseAuth: boolean;
}> {
  // quick auth check – if no session, don't thrash the network
  bc("sync start");

  const { data } = await supabase.auth.getSession();
  const sess = data.session;

  bc("session checked", {
    authed: !!sess?.user?.id,
  });

  if (!sess?.user?.id) {
    const q = await readQueue();
    bc("sync stopped: no session", { remaining: q.length });
    return { synced: 0, remaining: q.length, stoppedBecauseAuth: true };
  }

  let q = await readQueue();
  bc("queue loaded", { count: q.length });

  if (!q.length) return { synced: 0, remaining: 0, stoppedBecauseAuth: false };

  let synced = 0;
  let stoppedBecauseAuth = false;

  // Process sequentially: simplest + safest
  const next: PendingWorkoutJob[] = [];

  for (const job of q) {
    try {
      // Attempt server save using *current* authed user id
      const uid = sess.user.id;

      bc("job start", {
        clientSaveId: job.clientSaveId,
        attempts: job.attempts,
        workoutId: job.payload?.workout?.id,
        planWorkoutIdToComplete: job.planWorkoutIdToComplete,
      });

      await saveCompletedWorkoutFromReviewPayload({
        clientSaveId: job.clientSaveId,
        payload: job.payload,
        totalDurationSec: job.totalDurationSec,
        completedAt: new Date(job.completedAtIso),
        planWorkoutIdToComplete: job.planWorkoutIdToComplete ?? undefined,
      });

      bc("job success", { clientSaveId: job.clientSaveId });

      synced += 1;
      // drop the job (do not add to next[])
    } catch (e: any) {
      const msg = String(e?.message ?? "unknown");

      // record failure and keep it
      bc("job failed", {
        clientSaveId: job.clientSaveId,
        attemptsNext: job.attempts + 1,
        lastError: msg,
        authProblem: isAuthProblem(msg),
        networkProblem: isNetworkProblem(msg),
      });

      // ✅ Capture exception ONLY on first few attempts to avoid spamming
      if ((job.attempts ?? 0) < 2) {
        Sentry.captureException(e, {
          tags: {
            area: "pending_sync",
            stage: "saveCompletedWorkout",
            auth_problem: String(isAuthProblem(msg)),
            network_problem: String(isNetworkProblem(msg)),
          },
          extra: {
            clientSaveId: job.clientSaveId,
            attempts: job.attempts,
            lastError: msg,
            workoutId: job.payload?.workout?.id,
            planWorkoutIdToComplete: job.planWorkoutIdToComplete,
          },
        });
      }

      // Failed saves must remain queued, including when sync stops early.
      // Retain the original clientSaveId so retries stay idempotent.
      next.push({
        ...job,
        attempts: (job.attempts ?? 0) + 1,
        lastError: msg,
      });

      // If it smells like auth expired, stop processing remaining jobs.
      if (isAuthProblem(msg)) {
        stoppedBecauseAuth = true;
        bc("sync stopped: auth problem", { clientSaveId: job.clientSaveId });

        // carry the rest forward untouched
        const idx = q.indexOf(job);
        for (let j = idx + 1; j < q.length; j++) next.push(q[j]);
        break;
      }

      // Network problems: also stop early to avoid hammering
      if (isNetworkProblem(msg)) {
        bc("sync stopped: network problem", { clientSaveId: job.clientSaveId });
        const idx = q.indexOf(job);
        for (let j = idx + 1; j < q.length; j++) next.push(q[j]);
        break;
      }
    }
  }

  await writeQueue(next);
  bc("sync end", { synced, remaining: next.length, stoppedBecauseAuth });
  return { synced, remaining: next.length, stoppedBecauseAuth };
}

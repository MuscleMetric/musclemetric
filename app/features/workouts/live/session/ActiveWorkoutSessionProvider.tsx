// app/features/workouts/live/session/ActiveWorkoutSessionProvider.tsx

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { router, usePathname } from "expo-router";

import { useAuth } from "@/lib/authContext";
import { loadLiveDraftForUser } from "@/app/features/workouts/live/persist/local";
import { isLiveDraftCompleted } from "@/lib/workoutSaveIdentity";
import type { LiveWorkoutDraft } from "../state/types";
import type { ActiveWorkoutSessionContextValue } from "./types";
import { timerSecondsFromSnapshot, timerTextFromSeconds } from "./time";
import { ActiveWorkoutLiveActivityBridge } from "./ActiveWorkoutLiveActivityBridge";

export const ActiveWorkoutSessionContext =
  createContext<ActiveWorkoutSessionContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

function toDraft(raw: any): LiveWorkoutDraft | null {
  if (!raw || !raw.draftId || !raw.userId) return null;
  return raw as LiveWorkoutDraft;
}

export function ActiveWorkoutSessionProvider({ children }: Props) {
  const { session } = useAuth();
  const pathname = usePathname();

  const userId = session?.user?.id ?? null;

  const [activeDraft, setActiveDraft] = useState<LiveWorkoutDraft | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerText, setTimerText] = useState("00:00");
  const [loading, setLoading] = useState(true);

  const [bootHydrationComplete, setBootHydrationComplete] = useState(false);
  const [restoredDraftOnBoot, setRestoredDraftOnBoot] = useState(false);
  const [resumeGateHandled, setResumeGateHandled] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyDraftSnapshot = useCallback(
    (nextDraft: LiveWorkoutDraft | null) => {
      setActiveDraft(nextDraft);

      if (nextDraft) {
        const secs = timerSecondsFromSnapshot(nextDraft);
        setElapsedSeconds(secs);
        setTimerText(timerTextFromSeconds(secs));
      } else {
        setElapsedSeconds(0);
        setTimerText("00:00");
      }
    },
    [],
  );

  const hydrateOnBoot = useCallback(async () => {
    if (!userId) {
      applyDraftSnapshot(null);
      setBootHydrationComplete(true);
      setRestoredDraftOnBoot(false);
      setResumeGateHandled(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setBootHydrationComplete(false);

    try {
      const draft = await loadLiveDraftForUser(userId);
      const nextDraft = draft && !(await isLiveDraftCompleted(draft, userId))
        ? toDraft(draft)
        : null;

      applyDraftSnapshot(nextDraft);
      setRestoredDraftOnBoot(!!nextDraft);
      setResumeGateHandled(false);
    } catch {
      // Do not present a potentially completed draft when verification fails.
      // The persisted data is left intact to retry once connected.
      applyDraftSnapshot(null);
      setRestoredDraftOnBoot(false);
      setResumeGateHandled(false);
    } finally {
      setBootHydrationComplete(true);
      setLoading(false);
    }
  }, [userId, applyDraftSnapshot]);

  const refresh = useCallback(async () => {
    if (!userId) {
      applyDraftSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const draft = await loadLiveDraftForUser(userId);
      const nextDraft = draft && !(await isLiveDraftCompleted(draft, userId))
        ? toDraft(draft)
        : null;
      applyDraftSnapshot(nextDraft);
    } catch {
      // Fail closed on verification errors; never discard stored workout data.
      applyDraftSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [userId, applyDraftSnapshot]);

  const clearSnapshot = useCallback(() => {
    applyDraftSnapshot(null);
    setRestoredDraftOnBoot(false);
    setResumeGateHandled(true);
  }, [applyDraftSnapshot]);

  const resumeWorkout = useCallback(() => {
    if (!activeDraft) return;

    setResumeGateHandled(true);

    router.push({
      pathname: "/features/workouts/live",
      params: {
        workoutId: activeDraft.workoutId ?? "",
        planWorkoutId: activeDraft.planWorkoutId ?? "",
      },
    } as any);
  }, [activeDraft]);

  useEffect(() => {
    hydrateOnBoot();
  }, [hydrateOnBoot]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });

    return () => sub?.remove?.();
  }, [refresh]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!activeDraft) return;

    const sync = () => {
      const secs = timerSecondsFromSnapshot(activeDraft);
      setElapsedSeconds(secs);
      setTimerText(timerTextFromSeconds(secs));
    };

    sync();
    intervalRef.current = setInterval(sync, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    activeDraft?.draftId,
    activeDraft?.timerElapsedSeconds,
    activeDraft?.timerLastActiveAt,
  ]);

  const shouldShowResumeGate =
    bootHydrationComplete &&
    !!activeDraft &&
    restoredDraftOnBoot &&
    !resumeGateHandled &&
    !pathname?.startsWith("/features/workouts/live");

  const dismissResumeGate = useCallback(() => {
    setResumeGateHandled(true);
  }, []);

  const value = useMemo<ActiveWorkoutSessionContextValue>(
    () => ({
      activeDraft,
      hasActiveWorkout: !!activeDraft,
      elapsedSeconds,
      timerText,
      loading,
      refresh,
      clearSnapshot,
      resumeWorkout,
      shouldShowResumeGate,
      dismissResumeGate,
    }),
    [
      activeDraft,
      elapsedSeconds,
      timerText,
      loading,
      refresh,
      clearSnapshot,
      resumeWorkout,
      shouldShowResumeGate,
      dismissResumeGate,
    ],
  );

  return (
    <ActiveWorkoutSessionContext.Provider value={value}>
      <ActiveWorkoutLiveActivityBridge />
      {children}
    </ActiveWorkoutSessionContext.Provider>
  );
}

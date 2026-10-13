// app/features/workouts/live/review/ReviewWorkoutScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";

import type { LiveWorkoutDraft } from "../live/state/types";
import { bootLiveDraft } from "../live/boot/bootLiveDraft";
import { clearLiveDraftForUser } from "../live/persist/local";
import { clearServerDraft } from "../live/persist/server";
import { stopLiveWorkout } from "@/lib/liveWorkout";

import { LoadingScreen, ErrorState } from "@/ui";

import { ReviewHeader } from "./ui/ReviewHeader";
import { SummaryGrid } from "./ui/SummaryGrid";
import { ValidationCard } from "./ui/ValidationCard";
import { ExerciseReviewCard } from "./ui/ExerciseReviewCard";
import { SaveFooter } from "./ui/SaveFooter";

import { useReviewData } from "./useReviewData";

import AsyncStorage from "@react-native-async-storage/async-storage";

import WorkoutSavedScreen from "@/features/workoutShare/WorkoutSavedScreen";

import { log } from "@/lib/logger";

// ✅ Your save function (the one that calls save_completed_workout_v1)
// Make sure the path matches where you placed it.
import {
  saveCompletedWorkoutFromLiveDraft,
  durationSecondsFromDraft,
} from "@/lib/saveWorkout";
import { clearAllMmLiveDraftKeysForUser } from "../live/persist/mmLocal";
import { pauseLivePersist } from "../live/persist/persistControl";
import { liveWorkoutClientSaveId } from "@/lib/workoutSaveIdentity";

type Params = { workoutId?: string; planWorkoutId?: string };

const DEBUG_LIVE = __DEV__;

async function dumpLiveStorage(label: string, userId: string) {
  if (!DEBUG_LIVE) return;

  try {
    const keys = await AsyncStorage.getAllKeys();

    // filter to likely keys
    const liveKeys = keys.filter((k) => {
      const lk = k.toLowerCase();
      return (
        lk.includes("live") ||
        lk.includes("workout") ||
        lk.includes(userId.toLowerCase())
      );
    });

    // show a small preview of values for the most suspicious keys
    const interesting = liveKeys
      .filter(
        (k) => k.includes(userId) || k.toLowerCase().includes("live_workout"),
      )
      .slice(0, 25);

    const pairs = await AsyncStorage.multiGet(interesting);

    log(`[resume-debug] ${label}`, {
      totalKeys: keys.length,
      liveKeyCount: liveKeys.length,
      liveKeys,
      preview: pairs.map(([k, v]) => ({
        key: k,
        // truncate values so logs stay readable
        valuePreview: v ? v.slice(0, 180) : null,
      })),
    });
  } catch (e) {
    log(`[resume-debug] ${label} dump failed`, e);
  }
}

export default function ReviewWorkoutScreen() {
  const { colors, layout } = useAppTheme();
  const { userId } = useAuth();
  const params = useLocalSearchParams<Params>();

  const workoutId =
    typeof params.workoutId === "string" ? params.workoutId : undefined;
  const planWorkoutId =
    typeof params.planWorkoutId === "string" ? params.planWorkoutId : undefined;

  const uid = userId ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<LiveWorkoutDraft | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string | null>(null);
  const saveLock = useRef(false);


  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!uid) return;
      setLoading(true);
      setErr(null);

      try {
        const next = await bootLiveDraft({
          userId: uid,
          workoutId,
          planWorkoutId: planWorkoutId ?? null,
          preferServer: true,
        });

        if (cancelled) return;
        setDraft(next);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load workout for review.");
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [uid, workoutId, planWorkoutId]);

  const vm = useReviewData(draft);

  // “Can save” rule: at least 1 exercise has at least 1 completed set
  const canSave = useMemo(() => {
    if (!vm) return false;
    return vm.summary.setsCompleted > 0;
  }, [vm]);

  async function doSave() {
    if (!uid || !draft || !vm || saveLock.current || savedWorkoutId) return;
    if (draft.userId !== uid) {
      Alert.alert("Wrong account", "Please reopen your workout after switching accounts.");
      return;
    }

    if (!canSave) {
      Alert.alert(
        "Nothing to save",
        "Add at least one completed set before saving.",
      );
      return;
    }

    Alert.alert(
      "Save workout?",
      "This will save your workout and close the session.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async () => {
            if (saveLock.current) return;
            saveLock.current = true;
            let completedWorkoutId: string | null = null;
            try {
              setSaving(true);

              // Persisted draft UUID doubles as the RPC idempotency key.
              // Retries after app/screen restart must use the same value.
              const clientSaveId = liveWorkoutClientSaveId(draft, uid);
              const durationSeconds = durationSecondsFromDraft(draft);
              const completedAt = new Date();

              const saved = await saveCompletedWorkoutFromLiveDraft({
                clientSaveId,
                draft,
                workoutId: draft.workoutId ?? workoutId ?? null,
                durationSeconds,
                completedAt,
                planWorkoutIdToComplete:
                  draft.planWorkoutId ?? planWorkoutId ?? undefined,
              });
              completedWorkoutId = saved.workoutHistoryId;
              // ✅ only clear AFTER successful save
              log("[resume-debug] save succeeded -> clearing…", {
                uid,
                workoutId,
                planWorkoutId,
              });

              await dumpLiveStorage("BEFORE stop/clear", uid);

              pauseLivePersist(); // ✅ stops LiveWorkoutScreen from rewriting drafts
              stopLiveWorkout(); // should stop any autosave loops
              log("[resume-debug] stopLiveWorkout() done");

              try {
                await clearLiveDraftForUser(uid);
                log(
                  "[resume-debug] cleared local draft key live_workout:<uid>",
                );
              } catch (e) {
                log("[resume-debug] clearLiveDraftForUser FAILED", e);
              }

              const removed = await clearAllMmLiveDraftKeysForUser(uid);
              log("[resume-debug] cleared mm:liveDraft keys", removed);

              try {
                await clearServerDraft(uid);
                log("[resume-debug] cleared server draft row");
              } catch (e) {
                log("[resume-debug] clearServerDraft FAILED", e);
              }

              await dumpLiveStorage("AFTER stop/clear", uid);

              // Leave review screen + live screen
              setSavedWorkoutId(completedWorkoutId);
            } catch (e: any) {
              if (completedWorkoutId) {
                // Cleanup failures must never turn a saved session into a failed save.
                log("Post-save cleanup failed", e);
                setSavedWorkoutId(completedWorkoutId);
                return;
              }
              Alert.alert(
                "Save failed",
                e?.message ?? "Something went wrong while saving.",
              );
            } finally {
              saveLock.current = false;
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (savedWorkoutId && draft && vm) {
    return <WorkoutSavedScreen title={draft.title} sets={vm.summary.setsCompleted} exercises={vm.summary.exercisesWithCompletedSets}
      onSkip={() => router.replace("/")}
      onShare={() => router.replace({ pathname: "/features/social/create", params: { type: "workout", workoutHistoryId: savedWorkoutId, source: "workout_complete" } })} />;
  }

  if (!uid) {
    return (
      <ErrorState
        title="Not signed in"
        message="Please log in to save a workout."
      />
    );
  }

  if (loading) return <LoadingScreen />;

  if (err || !draft || !vm) {
    return (
      <ErrorState
        title="Couldn’t open review"
        message={err ?? "Unknown error"}
        onRetry={() => {
          setErr(null);
          setDraft(null);
          setLoading(true);
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ReviewHeader title="Review Workout" onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: layout.space.lg,
          paddingBottom: 140,
          gap: layout.space.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SummaryGrid summary={vm.summary} />

        <ValidationCard
          issues={vm.issues}
          onPressReview={() => {
            // Basic behaviour: just scroll naturally. (If you want “jump to first issue” with refs, we’ll add it next.)
          }}
        />

        {/* Exercise Breakdown */}
        <View style={{ gap: 12 }}>
          {vm.exercises.map((ex, idx) => (
            <ExerciseReviewCard
              key={`${ex.id}-${ex.orderIndex}`}
              index={idx}
              exercise={ex}
            />
          ))}
        </View>
      </ScrollView>

      <SaveFooter
        saving={saving}
        disabled={!canSave}
        onPressSave={doSave}
        hint="This will save your workout and close the session."
      />
    </View>
  );
}

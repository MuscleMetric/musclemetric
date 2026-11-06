// app/features/workouts/live/LiveWorkoutScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Alert,
  AppState,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { Card, LoadingScreen, ErrorState } from "@/ui";

import type { LiveWorkoutDraft } from "./state/types";
import { useSessionTargets } from "./useSessionTargets";
import { useExerciseHistory } from "./useExerciseHistory";
import { bootLiveDraft } from "./boot/bootLiveDraft";
import { usePersistDraft } from "./persist/usePersistDraft";
import { clearLiveDraftForUser } from "./persist/local";
import { clearServerDraft } from "./persist/server";

import { openExercise } from "./state/mutators";
import * as M from "./state/mutators";
import * as S from "./state/selectors";

import { LiveHeader } from "./ui/LiveHeader";
import { LiveWorkoutExerciseRow } from "./ui/LiveWorkoutExerciseRow";
import { LiveStickyFooter } from "./ui/LiveStickyFooter";
import { ExerciseEntryModal } from "./modals/ExerciseEntryModal";

import { stopLiveWorkout } from "@/lib/liveWorkout";
import { supabase } from "@/lib/supabase";
import { setSwapHandler } from "./swap/swapBus";
import { getRuntimeId } from "@/lib/runtimeId";

import {
  setSwapPickerCache,
  type SwapPickerOption,
  type Chip,
} from "./swap/swapPickerCache";

import { useActiveWorkoutSession } from "@/app/features/workouts/live/session/useActiveWorkoutSession";

// ✅ NEW: add flow (full-screen route + return handler)
import { setAddExercisesHandler } from "./add/addBus";
import {
  pauseLivePersist,
  registerPersistControls,
} from "./persist/persistControl";

import { clearAllMmLiveDraftKeysForUser } from "./persist/mmLocal";

type Params = { workoutId?: string; planWorkoutId?: string };

function nowIso() {
  return new Date().toISOString();
}

function secondsBetween(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.floor((b - a) / 1000));
}

/**
 * Timer derivation:
 * - timerElapsedSeconds = accumulated “confirmed” seconds
 * - timerLastActiveAt = anchor when running; null = paused (future)
 */
function timerSecondsFromDraft(d: LiveWorkoutDraft) {
  const base = Number(d.timerElapsedSeconds ?? 0);
  const last = d.timerLastActiveAt;
  if (!last) return base;
  return base + secondsBetween(last, nowIso());
}

function timerTextFromSeconds(totalSeconds: number) {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Cold-start normalization:
 * When the app was killed, we DO NOT want the timer to include time since last save.
 *
 * So:
 * - Commit only up to updatedAt (the last saved moment)
 * - Then resume timer from NOW (so it continues while app is alive)
 */
function normalizeTimerOnBoot(d: LiveWorkoutDraft): LiveWorkoutDraft {
  const now = nowIso();

  const elapsed = Number(d.timerElapsedSeconds ?? 0);
  const anchor = d.timerLastActiveAt;

  // If missing anchor, treat as "running from now" (you don't have pause UX yet)
  if (!anchor) {
    return {
      ...d,
      timerElapsedSeconds: elapsed,
      timerLastActiveAt: now,
      updatedAt: now,
    };
  }

  // Commit time ONLY up to last saved time (updatedAt). Ignore anything after that.
  const commitTo = d.updatedAt ?? anchor;
  const add = secondsBetween(anchor, commitTo);

  return {
    ...d,
    timerElapsedSeconds: elapsed + add,
    timerLastActiveAt: now,
    updatedAt: now,
  };
}

function fmtNum(n: number, dp = 0) {
  if (dp === 0) return `${Math.round(n)}`;
  return n.toFixed(dp);
}

function buildExerciseSubtitle(ex: any) {
  const type = (ex.type ?? "").toLowerCase();
  const p = ex.prescription ?? {};
  const targetSets = p.targetSets ?? ex.sets?.length ?? 0;

  if (type === "cardio") {
    const parts: string[] = [];
    parts.push(`${targetSets} sets`);
    if (p.targetDistance != null)
      parts.push(`${fmtNum(p.targetDistance, 2)}km`);
    if (p.targetTimeSeconds != null)
      parts.push(`${fmtNum(p.targetTimeSeconds)}s`);
    return parts.join(" • ");
  }

  if (p.targetReps != null && p.targetWeight != null) {
    return `${targetSets} sets × ${p.targetReps} • ${fmtNum(p.targetWeight)}kg`;
  }
  if (p.targetReps != null) return `${targetSets} sets × ${p.targetReps}`;
  if (p.targetWeight != null)
    return `${targetSets} sets • ${fmtNum(p.targetWeight)}kg`;

  return `${ex.sets?.length ?? 0} sets`;
}

export default function LiveWorkoutScreen() {
  const { userId } = useAuth();
  const { colors, typography, layout } = useAppTheme();
  const params = useLocalSearchParams<Params>();

  const workoutId =
    typeof params.workoutId === "string" ? params.workoutId : undefined;
  const planWorkoutId =
    typeof params.planWorkoutId === "string" ? params.planWorkoutId : undefined;

  const uid = userId ?? null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<LiveWorkoutDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // swap picker cache state (kept as you had it)
  const [swapOptions, setSwapOptions] = useState<SwapPickerOption[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapFavoriteIds, setSwapFavoriteIds] = useState<Set<string>>(
    new Set(),
  );
  const [swapUsageById, setSwapUsageById] = useState<Record<string, number>>(
    {},
  );
  const [swapEquipmentOptions, setSwapEquipmentOptions] = useState<string[]>(
    [],
  );
  const [swapMuscleGroups, setSwapMuscleGroups] = useState<Chip[]>([]);

  const { clearSnapshot, refresh } = useActiveWorkoutSession();

  const alreadyInIds = useMemo(() => {
    if (!draft) return [];
    return draft.exercises.map((e) => e.exerciseId);
  }, [draft?.exercises]);

  const optionsById = useMemo(() => {
    const map = new Map<string, SwapPickerOption>();
    for (const o of swapOptions) map.set(o.id, o);
    return map;
  }, [swapOptions]);

  function makeNewLiveExerciseDraft(args: {
    pick: SwapPickerOption;
    orderIndex: number;
  }): LiveWorkoutDraft["exercises"][number] {
    const { pick, orderIndex } = args;

    const isCardio = (pick.type ?? "").toLowerCase() === "cardio";
    const targetSets = isCardio ? 1 : 3;

    return {
      workoutExerciseId: null,
      exerciseId: pick.id,
      name: pick.name ?? "Exercise",
      orderIndex,

      equipment: pick.equipment ?? null,
      type: pick.type ?? null,
      level: pick.level ?? null,
      instructions: pick.instructions ?? null,

      prescription: {
        targetSets,
        targetReps: null,
        targetWeight: null,
        targetTimeSeconds: null,
        targetDistance: null,
        notes: null,
        supersetGroup: null,
        supersetIndex: null,
        isDropset: false,
      },

      lastSession: {
        completedAt: null,
        sets: [],
      },

      bestE1rm6m: null,
      bestSet6m: null,
      totalVolumeAllTime: null,

      isDone: false,
      sets: Array.from({ length: targetSets }).map((_, i) => ({
        setNumber: i + 1,
        dropIndex: 0,
        reps: null,
        weight: null,
        timeSeconds: null,
        distance: null,
        notes: null,
      })),
    };
  }

  useEffect(() => {
    return () => {
      // cleanup handlers
      setSwapHandler(null);
      setAddExercisesHandler(null);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSwapPicker() {
      setSwapLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_exercise_picker_data", {
          p_include_private: true,
        });
        if (error) throw error;
        if (!alive) return;

        const rows = (data ?? []) as any[];

        const nextOptions: SwapPickerOption[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type ?? null,
          equipment: r.equipment ?? null,
          level: r.level ?? null,
          instructions: r.instructions ?? null,
          muscleIds: Array.isArray(r.muscle_ids)
            ? r.muscle_ids.map((x: any) => String(x))
            : [],
          isFavorite: Boolean(r.is_favorite),
          sessionsCount: Number(r.sessions_count ?? 0),
          setsCount: Number(r.sets_count ?? 0),
          lastUsedAt: r.last_used_at ?? null,
        }));

        const fav = new Set<string>();
        const usage: Record<string, number> = {};
        const equipSet = new Set<string>();

        for (const o of nextOptions) {
          if (o.isFavorite) fav.add(o.id);
          usage[o.id] = o.sessionsCount ?? 0;
          if (o.equipment) equipSet.add(o.equipment);
        }

        const { data: muscles, error: mErr } = await supabase
          .from("muscles")
          .select("id,name")
          .order("name", { ascending: true });

        const mg: Chip[] = mErr
          ? []
          : (muscles ?? []).map((m: any) => ({
              id: String(m.id),
              label: m.name,
            }));

        if (!alive) return;

        const eqList = Array.from(equipSet).sort((a, b) => a.localeCompare(b));

        setSwapOptions(nextOptions);
        setSwapFavoriteIds(fav);
        setSwapUsageById(usage);
        setSwapEquipmentOptions(eqList);
        setSwapMuscleGroups(mg);

        setSwapPickerCache({
          options: nextOptions,
          favoriteIds: fav,
          usageByExerciseId: usage,
          equipmentOptions: eqList,
          muscleGroups: mg,
          loadedAt: Date.now(),
        });
      } catch (e) {
        console.warn("swap picker load failed", e);
      } finally {
        if (alive) setSwapLoading(false);
      }
    }

    if (swapOptions.length === 0) loadSwapPicker();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { persist, pause, resume, cancelTimer } = usePersistDraft({
    enabledServer: true,
    serverDebounceMs: 1200,
  });

  useEffect(() => {
    // Make live persist controllable from other screens (Review)
    registerPersistControls({ pause, resume, cancelTimer });

    return () => {
      // Ensure we never keep stale handlers around
      registerPersistControls(null);
    };
  }, [pause, resume, cancelTimer]);

  // ---- Timer UI tick ----
  const [timerText, setTimerText] = useState("00:00");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!draft) return;

    setTimerText(timerTextFromSeconds(timerSecondsFromDraft(draft)));

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimerText(timerTextFromSeconds(timerSecondsFromDraft(draft)));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [draft?.draftId, draft?.timerElapsedSeconds, draft?.timerLastActiveAt]);

  // ---- Boot draft ----
  useEffect(() => {
    let cancelled = false;

    async function boot() {
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

        const now = nowIso();
        const currentRuntime = getRuntimeId();

        const hydrated: LiveWorkoutDraft = {
          ...next,
          timerElapsedSeconds: next.timerElapsedSeconds ?? 0,
          timerLastActiveAt: next.timerLastActiveAt ?? now,
          updatedAt: next.updatedAt ?? now,
          timerRuntimeId: next.timerRuntimeId ?? null,
        };

        const isColdStart =
          hydrated.timerRuntimeId != null &&
          hydrated.timerRuntimeId !== currentRuntime;

        const finalDraft: LiveWorkoutDraft = isColdStart
          ? {
              ...normalizeTimerOnBoot(hydrated),
              timerRuntimeId: currentRuntime,
            }
          : { ...hydrated, timerRuntimeId: currentRuntime };

        setDraft(finalDraft);
        persist(finalDraft).catch(() => {});
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to start workout session");
        setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [uid, workoutId, planWorkoutId, persist]);

  // Background/lock -> snapshot only
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setDraft((prev) => {
          if (!prev) return prev;
          const now = nowIso();
          const next: LiveWorkoutDraft = {
            ...prev,
            updatedAt: now,
            timerRuntimeId: getRuntimeId(),
          };

          persist(next).catch(() => {});
          return next;
        });
      }
    });
    return () => sub.remove();
  }, [persist]);

  const update = React.useCallback((mut: (d: LiveWorkoutDraft) => LiveWorkoutDraft) => {
    setDraft((prev) => {
      if (!prev) return prev;

      const now = nowIso();
      const next = mut(prev);
      if (next === prev) return prev;

      const stamped: LiveWorkoutDraft = {
        ...next,
        updatedAt: now,
        timerElapsedSeconds: next.timerElapsedSeconds ?? 0,
        timerLastActiveAt: next.timerLastActiveAt ?? now,
        timerRuntimeId: getRuntimeId(),
      };

      persist(stamped).catch(() => {});
      return stamped;
    });
  }, [persist]);

  useExerciseHistory(draft, uid, update);
  useSessionTargets(draft, uid, update);

  function openExerciseAt(index: number) {
    update((d) => openExercise(d, index));
    setSheetOpen(true);
  }

  async function discardSessionConfirmed() {
    if (!uid) return;

    try {
      pauseLivePersist();
      await stopLiveWorkout();

      await clearLiveDraftForUser(uid);
      await clearAllMmLiveDraftKeysForUser(uid);
      await clearServerDraft(uid);

      clearSnapshot();
      await refresh();

      router.replace("/workout");
    } catch (e) {
      console.warn("discardSessionConfirmed failed", e);
    }
  }

  function confirmDiscard() {
    Alert.alert(
      "Cancel workout?",
      "If you cancel now, this in-progress workout will be deleted and won't be saved.",
      [
        { text: "Keep workout", style: "cancel" },
        {
          text: "Cancel workout",
          style: "destructive",
          onPress: discardSessionConfirmed,
        },
      ],
    );
  }

  function minimizeWorkout() {
    router.replace("/workout");
  }

  function openMoreMenu() {
    Alert.alert("Workout options", "Choose an action", [
      { text: "Keep workout", style: "cancel" },
      {
        text: "Cancel workout",
        style: "destructive",
        onPress: confirmDiscard,
      },
    ]);
  }

  const supersetLabels = useMemo(() => {
    if (!draft) return {} as Record<string, string>;
    return S.buildSupersetLabels(draft);
  }, [draft?.exercises]);

  const sortedExercises = useMemo(() => {
    if (!draft) return [] as any[];
    return draft.exercises
      .slice()
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [draft?.exercises]);

  if (!uid) {
    return (
      <ErrorState
        title="Not signed in"
        message="Please log in to start a workout."
      />
    );
  }

  if (loading) return <LoadingScreen />;

  if (err || !draft) {
    return (
      <ErrorState
        title="Couldn’t start workout"
        message={err ?? "Unknown error"}
        onRetry={() => {
          setErr(null);
          setDraft(null);
          setLoading(true);

          const nextParams: Record<string, string> = {};
          if (workoutId) nextParams.workoutId = workoutId;
          if (planWorkoutId) nextParams.planWorkoutId = planWorkoutId;

          router.replace({
            pathname: "/features/workouts/live",
            params: nextParams,
          });
        }}
      />
    );
  }

  const progress = S.getProgress(draft);
  const footerDisabled = !S.canCompleteWorkout(draft);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LiveHeader
        title={draft.title}
        subtitle="In Progress"
        timerText={timerText}
        onMinimize={minimizeWorkout}
        onMore={openMoreMenu}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: layout.space.lg,
          paddingBottom: 150,
          gap: layout.space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontFamily: typography.fontFamily.semibold,
                fontSize: typography.size.body,
                color: colors.text,
              }}
            >
              Keep moving
            </Text>
            <Text
              style={{
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.size.sub,
                color: colors.textMuted,
              }}
            >
              Tap an exercise to log sets. Everything autosaves.
            </Text>
          </View>
        </Card>

        <View style={{ gap: layout.space.md }}>
          {sortedExercises.map((ex: any, idx: number) => {
            const tags: string[] = [];

            const g = ex.prescription?.supersetGroup;
            if (g && supersetLabels[g]) tags.push(supersetLabels[g]);
            if (ex.prescription?.isDropset) tags.push("Dropset");

            const subtitleBase = buildExerciseSubtitle(ex);
            const lastLabel = S.getLastSessionLabel(ex);
            const subtitle = lastLabel
              ? `${subtitleBase} • Last: ${lastLabel}`
              : subtitleBase;

            const realIndex = draft.exercises.findIndex((e: any) => {
              if (e.workoutExerciseId && ex.workoutExerciseId) {
                return e.workoutExerciseId === ex.workoutExerciseId;
              }
              return (
                e.exerciseId === ex.exerciseId && e.orderIndex === ex.orderIndex
              );
            });

            const indexToOpen = realIndex >= 0 ? realIndex : idx;

            return (
              <LiveWorkoutExerciseRow
                key={
                  ex.workoutExerciseId ??
                  `${ex.exerciseId}-${ex.orderIndex ?? idx}`
                }
                index={idx + 1}
                title={ex.name}
                subtitle={subtitle}
                tags={tags.length ? tags : undefined}
                ex={ex}
                onPress={() => openExerciseAt(indexToOpen)}
              />
            );
          })}

          {/* ✅ Add exercises now navigates to full-screen add route */}
          <Card>
            <Pressable
              onPress={() => {
                // 1) register handler to receive selected IDs from /live/add
                setAddExercisesHandler(async ({ selectedIds }) => {
                  // IMPORTANT: clear immediately so it can’t fire twice
                  setAddExercisesHandler(null);

                  const ids = (selectedIds ?? []).map(String).filter(Boolean);
                  if (!ids.length) return;

                  // remove ones already in workout
                  const uniqueNewIds = ids.filter(
                    (id) => !alreadyInIds.includes(id),
                  );
                  if (uniqueNewIds.length === 0) return;

                  // 1) split into cached vs missing
                  const cachedPicks: SwapPickerOption[] = [];
                  const missingIds: string[] = [];

                  for (const id of uniqueNewIds) {
                    const cached = optionsById.get(id);
                    if (cached) cachedPicks.push(cached);
                    else missingIds.push(id);
                  }

                  // 2) fetch missing picks from DB (so newly created exercises work immediately)
                  let fetchedPicks: SwapPickerOption[] = [];
                  if (missingIds.length > 0) {
                    const { data: exRows, error: exErr } = await supabase
                      .from("exercises")
                      .select("id,name,type,equipment,level,instructions")
                      .in("id", missingIds);

                    if (exErr) {
                      console.warn(
                        "add-exercises: failed to fetch exercises:",
                        exErr,
                      );
                    } else {
                      // muscles (optional, but nice to keep parity)
                      const { data: emRows, error: emErr } = await supabase
                        .from("exercise_muscles")
                        .select("exercise_id,muscle_id")
                        .in("exercise_id", missingIds);

                      if (emErr) {
                        console.warn(
                          "add-exercises: failed to fetch exercise_muscles:",
                          emErr,
                        );
                      }

                      const muscleMap = new Map<string, string[]>();
                      for (const r of emRows ?? []) {
                        const exId = String((r as any).exercise_id);
                        const mId = String((r as any).muscle_id);
                        if (!muscleMap.has(exId)) muscleMap.set(exId, []);
                        muscleMap.get(exId)!.push(mId);
                      }

                      fetchedPicks = (exRows ?? []).map((r: any) => ({
                        id: String(r.id),
                        name: r.name ?? "Exercise",
                        type: r.type ?? null,
                        equipment: r.equipment ?? null,
                        level: r.level ?? null,
                        instructions: r.instructions ?? null,
                        muscleIds: (muscleMap.get(String(r.id)) ?? []).slice(
                          0,
                          3,
                        ),
                        // these fields exist on SwapPickerOption in your app; safe defaults:
                        isFavorite: false,
                        sessionsCount: 0,
                        setsCount: 0,
                        lastUsedAt: null,
                      }));
                    }
                  }

                  // 3) update cache so next time it’s instant (optional but recommended)
                  if (fetchedPicks.length > 0) {
                    setSwapOptions((prev) => {
                      const seen = new Set(prev.map((x) => x.id));
                      const extras = fetchedPicks.filter(
                        (x) => !seen.has(x.id),
                      );
                      return extras.length ? [...extras, ...prev] : prev;
                    });
                  }

                  const picks = [...cachedPicks, ...fetchedPicks];
                  if (picks.length === 0) return; // nothing resolvable

                  // 4) now safely add them to the live draft
                  update((d) => {
                    const maxOrder =
                      d.exercises.reduce(
                        (m, e) => Math.max(m, e.orderIndex ?? 0),
                        0,
                      ) ?? 0;

                    let order = maxOrder + 1;

                    const additions = picks.map((pick) =>
                      makeNewLiveExerciseDraft({
                        pick,
                        orderIndex: order++,
                      }),
                    );

                    return {
                      ...d,
                      exercises: [...d.exercises, ...additions],
                    };
                  });
                });

                // 2) navigate to full-screen picker route
                router.push({
                  pathname: "/features/workouts/live/add",
                  params: {
                    alreadyInIds: JSON.stringify(alreadyInIds),
                  },
                });
              }}
              style={{
                height: 52,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.fontFamily.semibold,
                  fontSize: typography.size.body,
                  color: colors.text,
                }}
              >
                + Add exercises
              </Text>
            </Pressable>

            <Text
              style={{
                marginTop: 10,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.size.sub,
                color: colors.textMuted,
              }}
            >
              Add as many as you like. Exercises already in this workout are
              disabled.
            </Text>
          </Card>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      <LiveStickyFooter
        disabled={footerDisabled}
        title={`Complete Workout (${progress.done}/${progress.total} exercises)`}
        onPress={() => {
          const nextParams: Record<string, string> = {};
          if (draft.workoutId) nextParams.workoutId = draft.workoutId;
          if (draft.planWorkoutId)
            nextParams.planWorkoutId = draft.planWorkoutId;

          router.push({
            pathname: "/features/workouts/review",
            params: nextParams,
          });
        }}
      />

      <ExerciseEntryModal
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        draft={draft}
        onUpdateSetValue={(a) => update((d) => M.updateSetValue(d, a))}
        onAddSet={(i) => update((d) => M.addSet(d, i))}
        onRemoveSet={(i) => update((d) => M.removeSet(d, i))}
        onPrevSet={() => update((d) => M.goPrevSet(d))}
        onNextSet={() => update((d) => M.goNextSupersetAware(d))}
        onSwapExercise={() => {
          const exIndex = draft.ui.activeExerciseIndex;

          setSheetOpen(false);

          setSwapHandler((picked) => {
            update((d) =>
              M.swapExercise(d, {
                exerciseIndex: exIndex,
                newExercise: {
                  exerciseId: picked.id,
                  name: picked.name ?? "Exercise",
                  equipment: picked.equipment ?? null,
                  type: picked.type ?? null,
                  level: picked.level ?? null,
                  instructions: picked.instructions ?? null,
                },
                resetSuperset: false,
                resetDropsetFlag: false,
              }),
            );

            setTimeout(() => setSheetOpen(true), 0);
            setSwapHandler(null);
          });

          router.push({
            pathname: "/features/workouts/live/swap/",
            params: {
              replacingExerciseId: draft.exercises[exIndex]?.exerciseId ?? "",
            },
          });
        }}
        onToggleDropset={(exerciseIndex, value) =>
          update((d) => M.setExerciseDropSet(d, { exerciseIndex, value }))
        }
        onJumpToExercise={(exerciseIndex) =>
          update((d) => M.openExercise(d, exerciseIndex))
        }
        onInitDropSetForSet={(a) => update((d) => M.initDropSetForSet(d, a))}
        onClearDropSetForSet={(a) => update((d) => M.clearDropSetForSet(d, a))}
        onAddDrop={(a) => update((d) => M.addDrop(d, a))}
        onUpdateDropSetValue={(a) => update((d) => M.updateDropSetValue(d, a))}
        onRemoveDrop={(a) => update((d) => M.removeDrop(d, a))}
      />
    </View>
  );
}

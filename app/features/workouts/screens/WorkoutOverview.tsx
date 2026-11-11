import { ExerciseDemo } from "@/features/vitalPreview/ExerciseDemo";
import React from "react";
import { View, Text, Pressable } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native"; // ✅ NEW

import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import {
  Card,
  Button,
  Icon,
  ModalSheet,
  WorkoutCover,
  SafeScroll,
  StatPillRow,
  StickyFooter,
  ExerciseRow,
  Section,
  Pill,
} from "@/ui";

import { useLiveWorkout } from "../hooks/useLiveWorkout";

// Helpers

function formatLastDone(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function formatKg(n: number | null) {
  if (n == null) return null;
  const v = Math.round(Number(n));
  return `${v.toLocaleString()} kg`;
}

// Keep cues as a single line.
function toSingleLineCue(s: string | null | undefined) {
  if (!s) return null;
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 90 ? one.slice(0, 87) + "…" : one;
}

function getWorkoutLastCompletedIso(exercises: any[]) {
  let best: string | null = null;
  for (const e of exercises) {
    const iso = e?.lastSession?.completedAt ?? null;
    if (!iso) continue;
    if (!best) best = iso;
    else if (new Date(iso).getTime() > new Date(best).getTime()) best = iso;
  }
  return best;
}

type ExerciseVM = any;

type RenderGroup =
  | { kind: "single"; ex: ExerciseVM }
  | {
      kind: "superset";
      groupKey: string;
      letter: string;
      items: ExerciseVM[];
    };

function buildExerciseGroups(exercises: ExerciseVM[]) {
  const out: RenderGroup[] = [];

  const idToLetter = new Map<string, string>();

  let next = 1;

  function getLetterFor(groupVal: any) {
    const key = String(groupVal);
    const existing = idToLetter.get(key);
    if (existing) return existing;
    const letter = toLetter(next++);
    idToLetter.set(key, letter);
    return letter;
  }

  let i = 0;

  while (i < exercises.length) {
    const ex = exercises[i];
    const g = ex?.prescription?.supersetGroup ?? null;

    // single
    if (!g) {
      out.push({ kind: "single", ex });
      i += 1;
      continue;
    }

    // superset block (consecutive items with same group id)
    const groupKey = String(g);
    const letter = getLetterFor(g);

    const items: ExerciseVM[] = [ex];
    let j = i + 1;

    while (j < exercises.length) {
      const nx = exercises[j];
      const ng = nx?.prescription?.supersetGroup ?? null;
      if (!ng || String(ng) !== groupKey) break;
      items.push(nx);
      j += 1;
    }

    // optional: A1 then A2 ordering
    items.sort((a, b) => {
      const ai = a?.prescription?.supersetIndex ?? 999;
      const bi = b?.prescription?.supersetIndex ?? 999;
      return ai - bi;
    });

    out.push({ kind: "superset", groupKey, letter, items });
    i = j;
  }

  return out;
}

function toLetter(n: number) {
  const clamped = Math.max(1, Math.min(26, n));
  return String.fromCharCode(64 + clamped); // 1->A
}

function supersetLetter(group: any) {
  if (group == null) return null;

  if (typeof group === "string") return group.toUpperCase();
  if (typeof group === "number") {
    const n = Math.max(1, Math.min(26, group));
    return String.fromCharCode(64 + n); // 1->A
  }
  return null;
}

function supersetPillLabel(group: any, items: any[]) {
  const letter = supersetLetter(group) ?? "A";

  // Use supersetIndex if present; otherwise 1..N
  const idxs = items
    .map((x) => x?.prescription?.supersetIndex)
    .map((n: any, i: number) => (typeof n === "number" && n > 0 ? n : i + 1));

  // de-dupe + sort
  const uniq = Array.from(new Set(idxs)).sort((a, b) => a - b);

  const detail = uniq.length
    ? `${letter}${uniq.join(`/${letter}`)}`
    : `${letter}1/${letter}2`;

  return `Superset ${letter}`;
}

// Main Screen

export default function WorkoutOverviewScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const params = useLocalSearchParams<{
    workoutId?: string;
    planWorkoutId?: string;
  }>();
  const workoutId = params.workoutId ?? null;
  const planWorkoutId = params.planWorkoutId ?? null;

  const { colors, typography, layout } = useAppTheme();

  if (!workoutId) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: layout.space.lg,
        }}
      >
        <Text
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamily.semibold,
          }}
        >
          Missing workout id.
        </Text>

        <View style={{ height: layout.space.md }} />

        <Button
          title="Back to Workouts"
          onPress={() => router.push("/workout")}
        />
      </View>
    );
  }

  return (
    <WorkoutOverviewContent
      userId={userId}
      workoutId={workoutId}
      planWorkoutId={planWorkoutId}
    />
  );
}

function WorkoutOverviewContent({
  userId,
  workoutId,
  planWorkoutId,
}: {
  userId: string | null;
  workoutId: string;
  planWorkoutId: string | null;
}) {
  const { colors, typography, layout } = useAppTheme();

  const {
    loading,
    error,
    bootstrap,
    headerChips,
    hadSavedDraft,
    createDraft,
    refetch,
  } = useLiveWorkout({ userId, workoutId, planWorkoutId } as any);

  // ✅ NEW: refetch whenever this screen becomes active again
  useFocusEffect(
    React.useCallback(() => {
      refetch?.();
    }, [refetch]),
  );

  const [exerciseModalOpen, setExerciseModalOpen] = React.useState(false);
  const [activeExerciseId, setActiveExerciseId] = React.useState<string | null>(
    null,
  );

  const exercises = React.useMemo(() => {
    if (!bootstrap) return [];
    return bootstrap.exercises
      .slice()
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [bootstrap]);

  const groups = React.useMemo(
    () => buildExerciseGroups(exercises),
    [exercises],
  );

  const activeExercise = React.useMemo(() => {
    if (!bootstrap || !activeExerciseId) return null;
    return (
      bootstrap.exercises.find((x) => x.exerciseId === activeExerciseId) ?? null
    );
  }, [bootstrap, activeExerciseId]);

  const isPlanWorkout = !!bootstrap?.workout.isPlanWorkout;

  const onPressStartOrContinue = React.useCallback(async () => {
    if (!bootstrap) return;
    await createDraft();

    router.push({
      pathname: "/features/workouts/live",
      params: {
        workoutId: bootstrap.workout.workoutId,
        planWorkoutId: bootstrap.workout.planWorkoutId ?? undefined,
      },
    });
  }, [bootstrap, createDraft]);

  const onPressEdit = React.useCallback(() => {
    if (!bootstrap) return;
    router.push({
      pathname: "/features/workouts/edit",
      params: { workoutId: bootstrap.workout.workoutId },
    });
  }, [bootstrap]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: layout.space.lg,
        }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.medium,
          }}
        >
          Loading…
        </Text>
      </View>
    );
  }

  if (error || !bootstrap) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: layout.space.lg,
        }}
      >
        <Text
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamily.semibold,
          }}
        >
          {error ?? "Failed to load workout."}
        </Text>
        <View style={{ height: layout.space.md }} />
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  // Build stat row: Duration | Avg volume | Last
  const lastIso = getWorkoutLastCompletedIso(exercises);
  const lastLabel = formatLastDone(lastIso);

  const statItems = [
    ...headerChips,
    ...(lastLabel ? [{ label: "Last Completed", value: lastLabel }] : []),
  ];

  let runningIndex = 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }}>
        <SafeScroll contentPaddingBottom={120}>
          {/* Banner card */}
          <Card>
            <View style={{ gap: layout.space.md }}>
              <WorkoutCover
                imageKey={bootstrap.workout.imageKey}
                title={null}
                subtitle={null}
                height={210}
                radius={layout.radius.xl}
                topLeft={
                  <Pressable
                    onPress={() => router.back()}
                    hitSlop={layout.hitSlop}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.35)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    <Icon name="chevron-back" size={18} color="#fff" />
                  </Pressable>
                }
                topRight={
                  !isPlanWorkout ? (
                    <Pressable
                      onPress={onPressEdit}
                      hitSlop={layout.hitSlop}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: layout.radius.pill,
                        backgroundColor: "rgba(0,0,0,0.35)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Icon name="create-outline" size={16} color="#fff" />
                      <Text
                        style={{
                          color: "#fff",
                          fontFamily: typography.fontFamily.semibold,
                          fontSize: typography.size.meta,
                        }}
                      >
                        Edit
                      </Text>
                    </Pressable>
                  ) : null
                }
              />

              {/* Title */}
              <Text
                style={{
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.size.h1,
                  lineHeight: typography.lineHeight.h1,
                  color: colors.text,
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                {bootstrap.workout.title}
              </Text>

              {/* Notes */}
              {bootstrap.workout.notes ? (
                <Text
                  style={{
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.size.body,
                    lineHeight: typography.lineHeight.body,
                    color: colors.textMuted,
                  }}
                  numberOfLines={2}
                >
                  {bootstrap.workout.notes}
                </Text>
              ) : null}

              {/* Stats */}
              {statItems.length ? (
                <StatPillRow items={statItems} borderless />
              ) : null}
            </View>
          </Card>

          {/* Goal section (plan only) */}
          {(() => {
            const todays = bootstrap.todaysGoals ?? [];
            const legacy = bootstrap.goals ?? [];

            // Prefer new structured payload
            if (todays.length) {
              return (
                <Card>
                  <Section title="Today’s goal">
                    <View style={{ gap: layout.space.sm }}>
                      {todays.map((g) => {
                        const target = Math.round(Number(g.targetThisSession));
                        const goal = Math.round(Number(g.goalWeight));
                        const unit = g.unit || "kg";

                        return (
                          <View
                            key={g.goalId}
                            style={{
                              padding: layout.space.md,
                              borderRadius: layout.radius.xl,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                              gap: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: typography.fontFamily.semibold,
                                color: colors.text,
                                fontSize: typography.size.body,
                              }}
                              numberOfLines={1}
                            >
                              {g.exerciseName}
                            </Text>

                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "baseline",
                                justifyContent: "space-between",
                                gap: layout.space.md,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: typography.fontFamily.bold,
                                  color: colors.text,
                                  fontSize: typography.size.h2,
                                  lineHeight: typography.lineHeight.h2,
                                }}
                              >
                                {target.toLocaleString()} {unit}
                              </Text>

                              <Text
                                style={{
                                  fontFamily: typography.fontFamily.semibold,
                                  color: colors.textMuted,
                                  fontSize: typography.size.sub,
                                }}
                              >
                                Goal {goal.toLocaleString()} {unit}
                              </Text>
                            </View>

                            <Text
                              style={{
                                fontFamily: typography.fontFamily.regular,
                                color: colors.textMuted,
                                fontSize: typography.size.sub,
                              }}
                            >
                              Session {g.sessionNumber} of {g.totalSessions} •{" "}
                              {g.sessionsPerWeek}/week
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </Section>
                </Card>
              );
            }

            // Fallback (legacy goals)
            if (legacy.length) {
              return (
                <Card>
                  <Section title="Today’s goal">
                    <View style={{ gap: layout.space.sm }}>
                      {legacy.map((g) => (
                        <View
                          key={g.id}
                          style={{
                            padding: layout.space.md,
                            borderRadius: layout.radius.xl,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: typography.fontFamily.semibold,
                              color: colors.text,
                            }}
                          >
                            {g.type} • {g.targetNumber}
                            {g.unit ? ` ${g.unit}` : ""}
                          </Text>
                          {g.notes ? (
                            <Text
                              style={{ marginTop: 4, color: colors.textMuted }}
                            >
                              {toSingleLineCue(g.notes)}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </Section>
                </Card>
              );
            }

            return null;
          })()}

          {/* Exercises list */}
          <Section
            title="Exercises"
            right={
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.medium,
                }}
              >
                {exercises.length} total
              </Text>
            }
          >
            <View style={{ gap: layout.space.sm }}>
              {groups.map((g, gi) => {
                if (g.kind === "single") {
                  const e = g.ex;
                  runningIndex += 1;

                  const vol = formatKg(e.totalVolumeAllTime);

                  const subtitleParts = [
                    e.equipment ? e.equipment : null,
                    e.prescription?.targetSets
                      ? `${e.prescription.targetSets} sets`
                      : null,
                    e.prescription?.targetReps
                      ? `${e.prescription.targetReps} reps`
                      : null,
                  ].filter(Boolean);

                  const isDropset = !!e?.prescription?.isDropset;

                  return (
                    <ExerciseRow
                      key={e.exerciseId}
                      index={runningIndex}
                      title={e.name}
                      subtitle={subtitleParts.join(" • ")}
                      leftBadge={
                        isDropset ? (
                          <Pill label="Dropset" tone="neutral" />
                        ) : null
                      }
                      rightNode={
                        vol ? (
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontFamily: typography.fontFamily.medium,
                              fontSize: typography.size.meta,
                            }}
                          >
                            {vol}
                          </Text>
                        ) : undefined
                      }
                      onPress={() => {
                        setActiveExerciseId(e.exerciseId);
                        setExerciseModalOpen(true);
                      }}
                    />
                  );
                }

                // Superset block
                const borderColor = colors.primary;
                const pillText = supersetPillLabel(g.letter, g.items);

                return (
                  <View
                    key={`superset-${g.groupKey}-${gi}`}
                    style={{
                      borderWidth: 1,
                      borderColor: borderColor,
                      borderRadius: layout.radius.lg,
                      overflow: "hidden",
                      backgroundColor: colors.surface,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: layout.space.md,
                        paddingTop: layout.space.md,
                        paddingBottom: layout.space.sm,
                        backgroundColor: "rgba(37,99,235,0.08)",
                      }}
                    >
                      <Pill label={pillText} tone="primary" />
                    </View>

                    {g.items.map((e, idxInGroup) => {
                      runningIndex += 1;

                      const vol = formatKg(e.totalVolumeAllTime);

                      const subtitleParts = [
                        e.equipment ? e.equipment : null,
                        e.prescription?.targetSets
                          ? `${e.prescription.targetSets} sets`
                          : null,
                        e.prescription?.targetReps
                          ? `${e.prescription.targetReps} reps`
                          : null,
                      ].filter(Boolean);

                      const isDropset = !!e?.prescription?.isDropset;

                      const isFirst = idxInGroup === 0;
                      const isLast = idxInGroup === g.items.length - 1;

                      return (
                        <ExerciseRow
                          key={e.exerciseId}
                          variant="plain"
                          isFirst={isFirst}
                          isLast={isLast}
                          showDivider={!isLast}
                          index={runningIndex}
                          title={e.name}
                          subtitle={subtitleParts.join(" • ")}
                          leftBadge={
                            isDropset ? (
                              <Pill label="Dropset" tone="neutral" />
                            ) : null
                          }
                          rightNode={
                            vol ? (
                              <Text
                                style={{
                                  color: colors.textMuted,
                                  fontFamily: typography.fontFamily.medium,
                                  fontSize: typography.size.meta,
                                }}
                              >
                                {vol}
                              </Text>
                            ) : undefined
                          }
                          onPress={() => {
                            setActiveExerciseId(e.exerciseId);
                            setExerciseModalOpen(true);
                          }}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </Section>
        </SafeScroll>

        {/* Bottom CTA */}
        <StickyFooter>
          <Button
            title={hadSavedDraft ? "Continue workout" : "Start workout"}
            onPress={onPressStartOrContinue}
          />
        </StickyFooter>

        {/* Exercise preview modal */}
        <ModalSheet
          visible={exerciseModalOpen}
          onClose={() => setExerciseModalOpen(false)}
          title={activeExercise?.name ?? "Exercise"}
          subtitle={
            activeExercise
              ? (toSingleLineCue(activeExercise.instructions) ?? undefined)
              : undefined
          }
        >
          {!activeExercise ? null : (
            <View style={{ gap: layout.space.md }}>
              <ExerciseDemo exerciseId={activeExercise.exerciseId} name={activeExercise.name} enabled={exerciseModalOpen} />
              <Card>
                <View style={{ gap: layout.space.sm }}>
                  <Text
                    style={{
                      fontFamily: typography.fontFamily.semibold,
                      color: colors.text,
                    }}
                  >
                    Last session
                  </Text>

                  <Text style={{ color: colors.textMuted }}>
                    {activeExercise.lastSession.completedAt
                      ? `Completed: ${formatLastDone(
                          activeExercise.lastSession.completedAt,
                        )}`
                      : "No history yet"}
                  </Text>
                </View>
              </Card>

              <Button
                title="Start exercise"
                onPress={async () => {
                  setExerciseModalOpen(false);
                  await createDraft();
                  router.push({
                    pathname: "/features/workouts/live",
                    params: {
                      workoutId: bootstrap.workout.workoutId,
                      planWorkoutId:
                        bootstrap.workout.planWorkoutId ?? undefined,
                      exerciseId: activeExercise.exerciseId,
                    },
                  });
                }}
              />
            </View>
          )}
        </ModalSheet>
      </SafeAreaView>
    </View>
  );
}

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "../../../../lib/useAppTheme";
import {
  usePlanDraft,
  createEmptyGoal,
  type ExerciseRow,
  type GoalDraft,
  type GoalMetric,
} from "./store";

import { Icon } from "@/ui";

type DedupExercise = {
  exercise: ExerciseRow;
  workoutTitles: string[];
};

const METRIC_LABEL: Record<GoalMetric, string> = {
  weight: "Weight",
  reps: "Reps",
  distance: "Distance",
  time: "Time",
};

const METRIC_UNIT: Record<GoalMetric, string> = {
  weight: "kg",
  reps: "reps",
  distance: "km",
  time: "sec",
};

export default function Goals() {
  const { colors, typography, layout } = useAppTheme();

  const s = useMemo(
    () => makeStyles(colors, typography, layout),
    [colors, typography, layout],
  );

  const { workouts, goals, endDate, upsertGoal, updateGoal, removeGoal } =
    usePlanDraft();

  const [query, setQuery] = useState("");

  const planWeeks = useMemo(() => {
    if (!endDate) return 1;

    const start = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - start.getTime();
    const weeks = diff / (1000 * 60 * 60 * 24 * 7);

    return Math.max(1, Math.ceil(weeks));
  }, [endDate]);

  const deduped: DedupExercise[] = useMemo(() => {
    const map = new Map<string, DedupExercise>();

    for (const w of workouts ?? []) {
      for (const ex of w.exercises ?? []) {
        const id = ex.exercise.id;

        if (!map.has(id)) {
          map.set(id, { exercise: ex.exercise, workoutTitles: [w.title] });
        } else {
          const entry = map.get(id)!;
          if (!entry.workoutTitles.includes(w.title)) {
            entry.workoutTitles.push(w.title);
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.exercise.name.localeCompare(b.exercise.name),
    );
  }, [workouts]);

  const goalErrors = useMemo(() => {
    const map = new Map<string, string>();

    for (const goal of goals) {
      const result = validateGoalAttainability(goal, planWeeks);

      if (!result.ok) {
        map.set(goal.exercise.id, result.message);
      }
    }

    return map;
  }, [goals, planWeeks]);

  const findGoal = useCallback(
    (exerciseId: string) =>
      goals.find((g) => g.exercise.id === exerciseId) ?? null,
    [goals],
  );

  function toggleExercise(ex: ExerciseRow) {
    const exists = findGoal(ex.id);

    if (exists) {
      if (goals.length <= 1) {
        Alert.alert(
          "At least one goal",
          "You need at least one goal exercise in your plan.",
        );
        return;
      }

      removeGoal(ex.id);
      return;
    }

    upsertGoal(createEmptyGoal(ex));
  }

  function toggleMetric(goal: GoalDraft, metric: GoalMetric) {
    const hasMetric = goal.metrics.includes(metric);

    if (hasMetric && goal.metrics.length <= 1) {
      Alert.alert(
        "At least one metric",
        "Each goal needs at least one metric to track.",
      );
      return;
    }

    const nextMetrics = hasMetric
      ? goal.metrics.filter((m) => m !== metric)
      : [...goal.metrics, metric];

    updateGoal(goal.exercise.id, { metrics: nextMetrics });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return deduped.filter(({ exercise }) => {
      return q.length === 0 || exercise.name.toLowerCase().includes(q);
    });
  }, [deduped, query]);

  const canContinue =
    goals.length >= 1 && goals.every(isGoalComplete) && goalErrors.size === 0;

  const openHelp = () => {
    Alert.alert(
      "Plan goals",
      "Select the exercises you want to track. You can add as many goals as your plan needs.",
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={layout.hitSlop}
          style={s.headerIconBtn}
        >
          <Text style={s.headerIcon}>‹</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={openHelp}
          hitSlop={layout.hitSlop}
          style={s.headerIconBtn}
        >
          <Text style={s.help}>i</Text>
        </Pressable>
      </View>

      <View style={s.progressWrap}>
        <Text style={s.progressKicker}>SETUP PROGRESS</Text>
        <View style={s.progressBarTrack}>
          <View style={[s.progressBarFill, { width: "75%" }]} />
        </View>
        <Text style={s.progressMeta}>Step 3 of 4</Text>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.md,
          paddingBottom: 140,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.h1}>Set plan goals</Text>
        <Text style={s.subTitle}>
          Pick key exercises and choose realistic targets for weight, reps,
          distance, time, or a combination.
        </Text>

        <Text style={s.sectionTitle}>SELECTED GOALS</Text>

        {goals.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No goals selected</Text>
            <Text style={s.emptyText}>
              Select exercises below to set targets.
            </Text>
          </View>
        ) : (
          <View style={{ gap: layout.space.sm }}>
            {goals.map((g) => {
              const selectedContext = findWorkoutTitlesForExercise(
                workouts,
                g.exercise.id,
              );
              const errorText = goalErrors.get(g.exercise.id);

              return (
                <View key={g.exercise.id} style={s.goalCard}>
                  <View style={s.goalHeader}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={s.goalName} numberOfLines={1}>
                        {g.exercise.name}
                      </Text>
                      <Text style={s.goalMeta} numberOfLines={1}>
                        {selectedContext || "In this plan"}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => toggleExercise(g.exercise)}
                      hitSlop={layout.hitSlop}
                    >
                      <Text style={s.removeText}>✕</Text>
                    </Pressable>
                  </View>

                  <View style={s.modeRow}>
                    {availableMetricsForExercise(g.exercise).map((m) => {
                      const active = g.metrics.includes(m);

                      return (
                        <Pressable
                          key={m}
                          onPress={() => toggleMetric(g, m)}
                          style={[s.modePill, active && s.modePillActive]}
                        >
                          <Text
                            style={[s.modeText, active && s.modeTextActive]}
                          >
                            {METRIC_LABEL[m]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View
                    style={{ marginTop: layout.space.sm, gap: layout.space.sm }}
                  >
                    {g.metrics.map((metric) => (
                      <MetricInputRow
                        key={metric}
                        goal={g}
                        metric={metric}
                        updateGoal={updateGoal}
                        colors={colors}
                        s={s}
                      />
                    ))}
                  </View>

                  <Text style={s.recoText}>{goalSummary(g)}</Text>

                  {errorText ? (
                    <Text style={s.goalErrorText}>{errorText}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={s.searchWrap}>
          <Text style={s.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises in this plan..."
            placeholderTextColor={colors.textMuted}
            style={s.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={layout.hitSlop}>
              <Text style={s.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={s.sectionTitle}>EXERCISES IN THIS PLAN</Text>

        <View style={{ gap: layout.space.sm }}>
          {filtered.map(({ exercise, workoutTitles }) => {
            const selected = !!findGoal(exercise.id);
            const contextText =
              workoutTitles.length > 0 ? workoutTitles.join(", ") : "—";

            return (
              <Pressable
                key={exercise.id}
                onPress={() => toggleExercise(exercise)}
                style={[
                  s.pickRow,
                  selected && s.pickRowSelected,
                ]}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={s.pickTitle} numberOfLines={1}>
                    {exercise.name}
                  </Text>
                  <Text style={s.pickMeta} numberOfLines={1}>
                    {contextText}
                  </Text>
                </View>

                <View
                  style={[
                    s.pickBadge,
                    selected ? s.pickBadgeOn : s.pickBadgeOff,
                  ]}
                >
                  <Text
                    style={[
                      s.pickBadgeText,
                      selected && { color: colors.onPrimary },
                    ]}
                  >
                    {selected ? "Selected" : "Select"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.bottomDock}>
        <Pressable
          style={[s.cta, !canContinue && s.ctaDisabled]}
          disabled={!canContinue}
          onPress={() => router.push("/features/plans/create/review")}
        >
          <Text style={s.ctaText}>Continue → Overview</Text>
        </Pressable>
      </View>

    </SafeAreaView>
  );
}

function MetricInputRow({
  goal,
  metric,
  updateGoal,
  colors,
  s,
}: {
  goal: GoalDraft;
  metric: GoalMetric;
  updateGoal: (exerciseId: string, patch: Partial<GoalDraft>) => void;
  colors: any;
  s: any;
}) {
  const startKey = metricStartKey(metric);
  const targetKey = metricTargetKey(metric);

  return (
    <View style={s.valueRow}>
      <NumberBox
        label={`Current ${METRIC_LABEL[metric].toLowerCase()}`}
        value={goal[startKey]}
        onChange={(n) =>
          updateGoal(goal.exercise.id, {
            [startKey]: n,
          } as Partial<GoalDraft>)
        }
        placeholder="0"
        colors={colors}
        s={s}
      />

      <View style={s.unitPill}>
        <Text style={s.unitText}>{METRIC_UNIT[metric]}</Text>
      </View>

      <NumberBox
        label={`Goal ${METRIC_LABEL[metric].toLowerCase()}`}
        value={goal[targetKey]}
        onChange={(n) =>
          updateGoal(goal.exercise.id, {
            [targetKey]: n,
          } as Partial<GoalDraft>)
        }
        placeholder="0"
        colors={colors}
        s={s}
      />
    </View>
  );
}

function NumberBox({
  label,
  value,
  onChange,
  placeholder,
  colors,
  s,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  placeholder: string;
  colors: any;
  s: any;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.valueInput}
        testID={`plan-goal-${label.toLowerCase().replace(/ /g, "-")}`}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        value={value != null ? String(value) : ""}
        onChangeText={(v) => {
          const trimmed = v.trim();

          if (!trimmed) {
            onChange(null);
            return;
          }

          const n = Number(trimmed);
          onChange(Number.isFinite(n) ? n : null);
        }}
      />
    </View>
  );
}

function availableMetricsForExercise(ex: ExerciseRow): GoalMetric[] {
  if (ex.type === "cardio") return ["distance", "time"];
  if (ex.type === "mobility") return ["time", "reps"];
  return ["weight", "reps", "time", "distance"];
}

function metricStartKey(metric: GoalMetric) {
  switch (metric) {
    case "weight":
      return "start_weight";
    case "reps":
      return "start_reps";
    case "distance":
      return "start_distance";
    case "time":
      return "start_time_seconds";
  }
}

function metricTargetKey(metric: GoalMetric) {
  switch (metric) {
    case "weight":
      return "target_weight";
    case "reps":
      return "target_reps";
    case "distance":
      return "target_distance";
    case "time":
      return "target_time_seconds";
  }
}

function isGoalComplete(g: GoalDraft) {
  if (!Array.isArray(g.metrics) || g.metrics.length === 0) return false;

  return g.metrics.every((metric) => {
    const start = g[metricStartKey(metric)];
    const target = g[metricTargetKey(metric)];

    return positive(start) && positive(target);
  });
}

function validateGoalAttainability(goal: GoalDraft, weeks: number) {
  if (!isGoalComplete(goal)) {
    return { ok: false, message: "Complete all selected goal metrics first." };
  }

  const maxRatio = 1 + 0.025 * Math.max(1, weeks);
  const startScore = performanceScore(goal, "start");
  const targetScore = performanceScore(goal, "target");

  if (!positive(startScore) || !positive(targetScore)) {
    return {
      ok: false,
      message: "This goal needs valid start and target values.",
    };
  }

  const ratio = targetScore / startScore;

  if (ratio > maxRatio) {
    const maxPct = Math.round((maxRatio - 1) * 100);

    return {
      ok: false,
      message: `This target looks too aggressive for ${weeks} week${
        weeks === 1 ? "" : "s"
      }. Keep the total improvement to around ${maxPct}% or extend the plan.`,
    };
  }

  return { ok: true, message: "" };
}

function performanceScore(goal: GoalDraft, side: "start" | "target") {
  const weight = valueFor(goal, side, "weight");
  const reps = valueFor(goal, side, "reps");
  const distance = valueFor(goal, side, "distance");
  const time = valueFor(goal, side, "time");

  const hasWeight = goal.metrics.includes("weight");
  const hasReps = goal.metrics.includes("reps");
  const hasDistance = goal.metrics.includes("distance");
  const hasTime = goal.metrics.includes("time");

  if (hasWeight && hasReps && !hasDistance && !hasTime) {
    return estimatedOneRepMax(weight, reps);
  }

  if (hasDistance && hasTime && !hasWeight && !hasReps) {
    return safeDivide(distance, time);
  }

  if (hasWeight && hasDistance && hasTime) {
    return safeDivide(weight * distance, time);
  }

  if (hasWeight && hasDistance) {
    return weight * distance;
  }

  if (hasWeight && hasTime) {
    const startTime = valueFor(goal, "start", "time");
    const targetTime = valueFor(goal, "target", "time");

    return targetTime < startTime ? safeDivide(weight, time) : weight * time;
  }

  if (hasReps && hasTime) {
    const startTime = valueFor(goal, "start", "time");
    const targetTime = valueFor(goal, "target", "time");

    return targetTime < startTime ? safeDivide(reps, time) : reps * time;
  }

  if (hasReps && hasDistance) {
    return reps * distance;
  }

  if (hasWeight) return weight;
  if (hasReps) return reps;
  if (hasDistance) return distance;

  if (hasTime) {
    const startTime = valueFor(goal, "start", "time");
    const targetTime = valueFor(goal, "target", "time");

    return targetTime >= startTime
      ? targetTime
      : safeDivide(startTime, targetTime);
  }

  return 0;
}

function estimatedOneRepMax(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

function valueFor(
  goal: GoalDraft,
  side: "start" | "target",
  metric: GoalMetric,
) {
  const key =
    side === "start" ? metricStartKey(metric) : metricTargetKey(metric);
  const value = goal[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeDivide(a: number, b: number) {
  if (!positive(a) || !positive(b)) return 0;
  return a / b;
}

function positive(n: number | null | undefined) {
  return n != null && Number.isFinite(n) && n > 0;
}

function goalSummary(g: GoalDraft) {
  const parts = g.metrics.map((metric) => {
    const start = g[metricStartKey(metric)];
    const target = g[metricTargetKey(metric)];
    const unit = METRIC_UNIT[metric];

    if (!positive(start) || !positive(target)) {
      return `${METRIC_LABEL[metric]} target not complete`;
    }

    return `${start}${unit} → ${target}${unit}`;
  });

  return parts.join(" • ");
}

function findWorkoutTitlesForExercise(workouts: any[], exerciseId: string) {
  const titles: string[] = [];

  for (const w of workouts ?? []) {
    const hit = (w?.exercises ?? []).some(
      (x: any) => x?.exercise?.id === exerciseId,
    );

    if (hit) titles.push(String(w?.title ?? "Workout"));
  }

  return titles.join(", ");
}

const makeStyles = (colors: any, typography: any, layout: any) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: layout.space.lg,
      paddingTop: layout.space.sm,
      paddingBottom: layout.space.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: layout.radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIcon: {
      color: colors.primary,
      fontSize: 26,
      fontFamily: typography.fontFamily.bold,
      marginTop: -2,
    },
    help: {
      color: colors.textMuted,
      fontSize: 18,
      fontFamily: typography.fontFamily.bold,
    },
    progressWrap: {
      paddingHorizontal: layout.space.lg,
      paddingBottom: layout.space.sm,
    },
    progressKicker: {
      color: colors.textMuted,
      fontSize: typography.size.meta,
      fontFamily: typography.fontFamily.semibold,
      letterSpacing: 0.8,
      marginBottom: layout.space.xs,
    },
    progressBarTrack: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.trackBg,
      overflow: "hidden",
    },
    progressBarFill: {
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    progressMeta: {
      marginTop: layout.space.xs,
      color: colors.textMuted,
      fontSize: typography.size.meta,
      fontFamily: typography.fontFamily.medium,
      textAlign: "right",
    },
    h1: {
      color: colors.text,
      fontSize: typography.size.h1,
      lineHeight: typography.lineHeight.h1,
      fontFamily: typography.fontFamily.bold,
      letterSpacing: -0.3,
    },
    subTitle: {
      marginTop: 6,
      color: colors.textMuted,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
      fontFamily: typography.fontFamily.medium,
    },
    sectionTitle: {
      marginTop: layout.space.md,
      marginBottom: layout.space.sm,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: 12,
      letterSpacing: 0.8,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: layout.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: layout.space.md,
    },
    emptyTitle: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sub,
    },
    emptyText: {
      marginTop: 4,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },
    goalCard: {
      backgroundColor: colors.surface,
      borderRadius: layout.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: layout.space.md,
    },
    goalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: layout.space.sm,
    },
    goalName: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.body,
    },
    goalMeta: {
      marginTop: 2,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },
    removeText: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
    },
    modeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: layout.space.sm,
    },
    modePill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: layout.radius.pill,
      backgroundColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    modePillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modeText: {
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
    },
    modeTextActive: {
      color: colors.onPrimary,
    },
    valueRow: {
      marginTop: layout.space.sm,
      flexDirection: "row",
      gap: layout.space.sm,
      alignItems: "flex-end",
    },
    fieldLabel: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
      marginBottom: 6,
    },
    valueInput: {
      backgroundColor: colors.bg,
      borderRadius: layout.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.body,
    },
    unitPill: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: layout.radius.pill,
      backgroundColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 2,
    },
    unitText: {
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
    },
    recoText: {
      marginTop: layout.space.sm,
      color: colors.primary,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },
    goalErrorText: {
      marginTop: layout.space.sm,
      color: colors.danger ?? "#ef4444",
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
      lineHeight: typography.lineHeight.meta,
    },
    searchWrap: {
      marginTop: layout.space.md,
      flexDirection: "row",
      alignItems: "center",
      gap: layout.space.sm,
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: layout.space.md,
      paddingVertical: 12,
    },
    searchIcon: {
      color: colors.textMuted,
      fontSize: 16,
      fontFamily: typography.fontFamily.bold,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: typography.size.body,
      lineHeight: typography.lineHeight.body,
      fontFamily: typography.fontFamily.medium,
    },
    clear: {
      color: colors.textMuted,
      fontSize: 14,
      fontFamily: typography.fontFamily.bold,
    },
    pickRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: layout.space.md,
      paddingVertical: 12,
      paddingHorizontal: layout.space.md,
      backgroundColor: colors.surface,
      borderRadius: layout.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pickRowSelected: {
      borderColor: colors.primary,
    },
    pickTitle: {
      color: colors.text,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.body,
    },
    pickMeta: {
      marginTop: 2,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.meta,
    },
    pickBadge: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: layout.radius.pill,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 90,
    },
    pickBadgeOff: {
      backgroundColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pickBadgeOn: {
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    pickBadgeText: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.meta,
    },
    bottomDock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: layout.space.lg,
      paddingBottom: layout.space.lg,
      paddingTop: layout.space.sm,
      backgroundColor: colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    cta: {
      height: 56,
      borderRadius: layout.radius.xl,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaDisabled: {
      opacity: 0.45,
    },
    ctaText: {
      color: colors.onPrimary,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.body,
    },
    goalLimitScrim: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: layout.space.lg,
    },
    goalLimitModal: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      padding: layout.space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
    },
    goalLimitIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: layout.space.md,
    },
    goalLimitTitle: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.h3,
      textAlign: "center",
    },
    goalLimitText: {
      marginTop: layout.space.sm,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sub,
      lineHeight: typography.lineHeight.sub,
      textAlign: "center",
    },
    goalLimitPrimary: {
      marginTop: layout.space.lg,
      height: 50,
      alignSelf: "stretch",
      borderRadius: layout.radius.xl,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    goalLimitPrimaryText: {
      color: colors.onPrimary,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sub,
    },
    goalLimitSecondary: {
      marginTop: layout.space.sm,
      height: 44,
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
    },
    goalLimitSecondaryText: {
      color: colors.textMuted,
      fontFamily: typography.fontFamily.semibold,
      fontSize: typography.size.meta,
    },
  });

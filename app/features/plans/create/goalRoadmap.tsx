import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/lib/useAppTheme";

import {
  formatMetric,
  getMetricValue,
  matchingWorkouts,
  positive,
  roadmapWeeks,
  sessionMetric,
  type GoalRow,
  type Metric,
  type PlanRow,
  type PlanWorkoutRow,
  type WorkoutExerciseRow,
} from "@/lib/plans/goalRoadmap";
import { loadGoalRoadmap } from "@/lib/plans/loadGoalRoadmap";

const METRIC_LABEL: Record<Metric, string> = {
  weight: "Weight",
  reps: "Reps",
  distance: "Distance",
  time: "Time",
};

const METRIC_UNIT: Record<Metric, string> = {
  weight: "kg",
  reps: "reps",
  distance: "km",
  time: "sec",
};

export default function GoalRoadmap() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();

  const { colors, typography, layout } = useAppTheme();
  const s = useMemo(
    () => makeStyles(colors, typography, layout),
    [colors, typography, layout],
  );

  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [planWorkouts, setPlanWorkouts] = useState<PlanWorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<
    WorkoutExerciseRow[]
  >([]);

  useEffect(() => {
    if (!planId) return;

    let mounted = true;

    async function load() {
      setLoading(true);

      setFailed(false);
      try {
        const data = await loadGoalRoadmap(planId!);
        if (!mounted) return;
        setPlan(data.plan);
        setGoals(data.goals);
        setPlanWorkouts(data.workouts);
        setWorkoutExercises(data.exercises);
      } catch {
        if (mounted) setFailed(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [planId]);

  const weeks = roadmapWeeks(plan);
  const workoutsByExercise = useMemo(() => {
    const map = new Map<string, PlanWorkoutRow[]>();

    for (const goal of goals) {
      map.set(
        goal.exercise_id,
        matchingWorkouts(goal.exercise_id, planWorkouts, workoutExercises),
      );
    }

    return map;
  }, [goals, planWorkouts, workoutExercises]);

  if (failed)
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <Text style={s.muted}>Couldn’t load the goal roadmap.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={s.muted}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );

  if (loading) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={s.muted}>Building your goal roadmap…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: layout.space.lg,
          paddingBottom: layout.space.xl,
          gap: layout.space.md,
        }}
      >
        <View style={s.headerCard}>
          <Text style={s.h1}>Goal roadmap</Text>
          <Text style={s.muted}>
            Here’s what to aim for each time your goal exercises appear in this
            plan.
          </Text>

          <View style={s.summaryPill}>
            <Text style={s.summaryText}>
              {plan?.title ?? "Plan"} • {weeks} week{weeks === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        {goals.map((goal) => {
          const matchingWorkouts =
            workoutsByExercise.get(goal.exercise_id) ?? [];
          const sessions = buildSessions(goal, matchingWorkouts, weeks);

          return (
            <View key={goal.id} style={s.card}>
              <Text style={s.h2}>
                {goal.exercises?.[0]?.name ?? "Goal exercise"}
              </Text>
              <Text style={s.muted}>{goalSummary(goal)}</Text>

              {matchingWorkouts.length === 0 ? (
                <View style={s.warningCard}>
                  <Text style={s.warningTitle}>Not in any workout</Text>
                  <Text style={s.muted}>
                    Add this exercise to a workout so MuscleMetric can guide
                    your weekly targets.
                  </Text>
                </View>
              ) : (
                <View
                  style={{ gap: layout.space.sm, marginTop: layout.space.md }}
                >
                  {sessions.map((session) => (
                    <View key={session.key} style={s.sessionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.sessionTitle}>
                          Week {session.week} • {session.workoutTitle}
                        </Text>
                        <Text style={s.sessionTarget}>
                          {session.targetText}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Pressable style={s.cta} onPress={() => router.replace("/workout")}>
          <Text style={s.ctaText}>Go to workouts</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function buildSessions(
  goal: GoalRow,
  workouts: PlanWorkoutRow[],
  weeks: number,
) {
  const safeWorkouts = workouts.length > 0 ? workouts : [];
  const totalSessions = Math.max(1, weeks * Math.max(1, safeWorkouts.length));

  const sessions: {
    key: string;
    week: number;
    workoutTitle: string;
    targetText: string;
  }[] = [];

  let sessionIndex = 0;

  for (let week = 1; week <= weeks; week++) {
    for (const workout of safeWorkouts) {
      sessionIndex += 1;

      sessions.push({
        key: `${goal.id}-${week}-${workout.id}`,
        week,
        workoutTitle: workout.title,
        targetText: (goal.metrics ?? [])
          .map((metric) =>
            metricTargetText(goal, metric, sessionIndex, totalSessions),
          )
          .join(" • "),
      });
    }
  }

  return sessions;
}

function metricTargetText(
  goal: GoalRow,
  metric: Metric,
  sessionIndex: number,
  totalSessions: number,
) {
  const value = sessionMetric(goal, metric, sessionIndex, totalSessions);
  return value == null
    ? `${METRIC_LABEL[metric]} incomplete`
    : `${METRIC_LABEL[metric]} ${value}${METRIC_UNIT[metric]}`;
}

function goalSummary(goal: GoalRow) {
  return (goal.metrics ?? [])
    .map((metric) => {
      const start = getMetricValue(goal, metric, "start");
      const target = getMetricValue(goal, metric, "target");

      if (!positive(start) || !positive(target)) {
        return `${METRIC_LABEL[metric]} incomplete`;
      }

      return `${METRIC_LABEL[metric]}: ${formatMetric(
        metric,
        start as number,
      )}${METRIC_UNIT[metric]} → ${formatMetric(metric, target as number)}${
        METRIC_UNIT[metric]
      }`;
    })
    .join(" • ");
}

const makeStyles = (colors: any, typography: any, layout: any) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
      gap: layout.space.sm,
    },
    headerCard: {
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      padding: layout.space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: layout.space.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: layout.radius.xl,
      padding: layout.space.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    warningCard: {
      marginTop: layout.space.md,
      backgroundColor: colors.bg,
      borderRadius: layout.radius.lg,
      padding: layout.space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    warningTitle: {
      color: colors.text,
      fontSize: typography.size.sub,
      fontFamily: typography.fontFamily.bold,
    },
    h1: {
      color: colors.text,
      fontSize: typography.size.h1,
      lineHeight: typography.lineHeight.h1,
      fontFamily: typography.fontFamily.bold,
      letterSpacing: -0.3,
    },
    h2: {
      color: colors.text,
      fontSize: typography.size.h3,
      lineHeight: typography.lineHeight.h3,
      fontFamily: typography.fontFamily.bold,
    },
    muted: {
      color: colors.textMuted,
      fontSize: typography.size.meta,
      lineHeight: typography.lineHeight.meta,
      fontFamily: typography.fontFamily.medium,
    },
    summaryPill: {
      alignSelf: "flex-start",
      marginTop: layout.space.sm,
      backgroundColor: colors.bg,
      borderRadius: layout.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    summaryText: {
      color: colors.primary,
      fontSize: typography.size.meta,
      fontFamily: typography.fontFamily.bold,
    },
    sessionRow: {
      backgroundColor: colors.bg,
      borderRadius: layout.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: layout.space.md,
    },
    sessionTitle: {
      color: colors.text,
      fontSize: typography.size.meta,
      lineHeight: typography.lineHeight.meta,
      fontFamily: typography.fontFamily.bold,
    },
    sessionTarget: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: typography.size.meta,
      lineHeight: typography.lineHeight.meta,
      fontFamily: typography.fontFamily.medium,
    },
    cta: {
      height: 56,
      borderRadius: layout.radius.xl,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaText: {
      color: colors.onPrimary,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.body,
    },
  });

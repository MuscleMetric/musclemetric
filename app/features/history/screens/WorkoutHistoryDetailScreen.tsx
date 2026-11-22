import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import {
  Screen,
  ScreenHeader,
  Card,
  LoadingScreen,
  ErrorState,
  Icon,
} from "@/ui";

import { routeSlot } from "@/features/cardio/workoutOutdoor";
import { RunHistoryDetail } from "@/features/cardio/RunHistoryDetail";
import { HistorySectionHeader } from "../ui/HistorySectionHeader";
import { PRBadge } from "../ui/PRBadge";
import { WorkoutHistoryExerciseRow } from "../ui/WorkoutHistoryExerciseRow";

import { ShareWorkoutSheet } from "../share/ShareWorkoutSheet";
import type { ShareWorkoutData } from "../share/workoutShare";

const RPC_WORKOUT_HISTORY_DETAIL = "get_workout_history_detail";

type Insight = {
  metric?: "volume" | string;
  trend?: "up" | "down" | "flat";
  delta_pct?: number | null;
  label?: string;
} | null;

type CardioPR = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  metric:
    | "longest_distance"
    | "best_pace"
    | "fastest_1k"
    | "fastest_3k"
    | "fastest_5k"
    | "fastest_10k"
    | "fastest_15k"
    | "fastest_20k"
    | "fastest_half_marathon"
    | "fastest_marathon";
  benchmark_distance_km?: number | null;
  value: number;
  calculation_method?: string | null;
  workout_set_history_id?: string | null;
  achieved_at?: string | null;
};

type DetailPayload = {
  meta?: { timezone?: string; unit?: "kg" };

  header?: {
    workout_history_id: string;
    workout_id?: string | null;
    title: string;
    completed_at: string;
    notes?: string | null;
  };

  stats?: {
    duration_seconds?: number | null;
    sets_count?: number | null;
    volume_kg?: number | null;
    distance_total?: number | null;
    insight?: Insight;
  };

  prs?: Array<{
    exercise_id: string;
    exercise_name: string;
    e1rm?: number | null;
    weight_kg?: number | null;
    reps?: number | null;
    delta_abs?: number | null;
    delta_pct?: number | null;
  }>;

  cardio_prs?: CardioPR[];

  exercises?: Array<{
    exercise_id: string;
    exercise_name: string;
    order_index?: number | null;
    is_pr?: boolean | null;
    is_cardio_pr?: boolean | null;
    sets?: Array<{
      set_id?: string;
      set_number: number;
      reps?: number | null;
      weight_kg?: number | null;
      e1rm?: number | null;
      time_seconds?: number | null;
      distance?: number | null;
      is_best?: boolean | null;
      is_pr?: boolean | null;
      is_cardio_pr?: boolean | null;
    }>;
  }>;
};

function fmtDayTime(iso?: string | null) {
  if (!iso) return "";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function fmtMins(sec?: number | null) {
  if (!sec || !isFinite(sec)) return "—";
  return `${Math.max(1, Math.round(sec / 60))}m`;
}

function n0(x?: number | null) {
  if (x == null || !isFinite(x)) return "—";
  return String(Math.round(x));
}

function fmtKg(x?: number | null) {
  if (x == null || !isFinite(x)) return "—";
  return `${Math.round(x)}`;
}

function fmtDuration(sec?: number | null) {
  if (sec == null || !isFinite(sec)) return "—";

  const total = Math.max(0, Math.round(sec));
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  if (mins <= 0) return `${secs}s`;
  if (secs === 0) return `${mins} mins`;

  return `${mins}m ${secs}s`;
}

function fmtClock(sec?: number | null) {
  if (sec == null || !isFinite(sec)) return "—";

  const total = Math.max(0, Math.round(sec));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0",
    )}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function fmtDistance(x?: number | null) {
  if (x == null || !isFinite(x)) return null;

  const rounded = Math.round(Number(x) * 100) / 100;
  return `${rounded} km`;
}

function fmtPace(secPerKm?: number | null) {
  if (secPerKm == null || !isFinite(secPerKm)) return "—";

  const total = Math.max(0, Math.round(secPerKm));
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function hasTimeOrDistance(st: {
  time_seconds?: number | null;
  distance?: number | null;
}) {
  return st.time_seconds != null || st.distance != null;
}

function fmtSetSummary(st: {
  reps?: number | null;
  weight_kg?: number | null;
  time_seconds?: number | null;
  distance?: number | null;
}) {
  if (hasTimeOrDistance(st)) {
    const parts = [
      st.time_seconds != null ? fmtDuration(st.time_seconds) : null,
      fmtDistance(st.distance),
    ].filter(Boolean);

    if (st.time_seconds != null && st.distance != null && st.distance > 0) {
      parts.push(fmtPace(st.time_seconds / st.distance));
    }

    if (st.weight_kg != null) {
      parts.push(`${st.weight_kg} kg`);
    }

    if (st.reps != null) {
      parts.push(`${st.reps} reps`);
    }

    return parts.length ? parts.join(" • ") : "—";
  }

  if (st.weight_kg != null && st.reps != null) {
    return `${st.weight_kg} kg × ${st.reps}`;
  }

  if (st.reps != null) return `${st.reps} reps`;
  if (st.weight_kg != null) return `${st.weight_kg} kg`;

  return "—";
}

function fmtCardioMetricLabel(pr: CardioPR) {
  const metric = pr.metric;
  if (metric.startsWith("fastest_") && pr.calculation_method !== "exact_split" && pr.calculation_method !== "manual") {
    return "Estimated " + metric.slice(8).replace(/_/g, " ") + " time";
  }
  switch (metric) {
    case "longest_distance":
      return "Longest Distance";
    case "best_pace":
      return "Best Pace";
    case "fastest_1k":
      return "Fastest 1K";
    case "fastest_3k":
      return "Fastest 3K";
    case "fastest_5k":
      return "Fastest 5K";
    case "fastest_10k":
      return "Fastest 10K";
    case "fastest_15k":
      return "Fastest 15K";
    case "fastest_20k":
      return "Fastest 20K";
    case "fastest_half_marathon":
      return "Fastest Half Marathon";
    case "fastest_marathon":
      return "Fastest Marathon";
    default:
      return "Cardio PB";
  }
}

function fmtCardioPRValue(pr: CardioPR) {
  if (pr.metric === "longest_distance") return fmtDistance(pr.value) ?? "—";
  if (pr.metric === "best_pace") return fmtPace(pr.value);
  return fmtClock(pr.value);
}

export default function WorkoutHistoryDetailScreen({
  workoutHistoryId: workoutHistoryIdProp,
}: {
  workoutHistoryId?: string;
} = {}) {
  const { colors, typography, layout } = useAppTheme();
  const params = useLocalSearchParams<{ workoutHistoryId?: string }>();

  const workoutHistoryId = useMemo(
    () => (workoutHistoryIdProp ?? params.workoutHistoryId ?? "").toString(),
    [workoutHistoryIdProp, params.workoutHistoryId],
  );

  const [data, setData] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!workoutHistoryId) {
        setErr("Missing workoutHistoryId");
        setData(null);
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      setErr(null);

      const { data: res, error } = await supabase.rpc(
        RPC_WORKOUT_HISTORY_DETAIL,
        {
          p_workout_history_id: workoutHistoryId,
        },
      );

      if (error) {
        setErr(error.message);
        setData(null);
      } else {
        setData(res as DetailPayload);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [workoutHistoryId],
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  const header = data?.header ?? null;
  const stats = data?.stats ?? null;
  const insight = stats?.insight ?? null;
  const exercises = data?.exercises ?? [];
  const prs = data?.prs ?? [];
  const cardioPrs = data?.cardio_prs ?? [];

  const prsCount = prs.length;
  const cardioPrsCount = cardioPrs.length;
  const totalPrs = prsCount + cardioPrsCount;

  const hasDistance = (stats?.distance_total ?? 0) > 0;
  const hasVolume = (stats?.volume_kg ?? 0) > 0;

  const shareData: ShareWorkoutData = useMemo(() => {
    if (!header) {
      return {
        title: "",
        dateLabel: "",
        durationLabel: "",
        totalSets: null,
        totalVolumeKg: null,
        totalDistanceKm: null,
        exercises: [],
        prs: [],
      };
    }

    const strengthPrs = prs.map((p) => ({
      exerciseName: p.exercise_name,
      kind: "strength" as const,
      label: "Strength PR",
      value:
        p.weight_kg != null && p.reps != null
          ? `${p.weight_kg} kg × ${p.reps}`
          : p.e1rm != null
            ? `${Math.round(p.e1rm)} kg e1RM`
            : "New PR",
    }));

    const cardioPbItems = cardioPrs.map((p) => ({
      exerciseName: p.exercise_name,
      kind: "cardio" as const,
      label: fmtCardioMetricLabel(p),
      value: fmtCardioPRValue(p),
    }));

    return {
      title: header.title ?? "Workout",
      dateLabel: fmtDayTime(header.completed_at),
      durationLabel: fmtMins(stats?.duration_seconds),

      totalSets: stats?.sets_count ?? null,
      totalVolumeKg: stats?.volume_kg ?? null,
      totalDistanceKm: stats?.distance_total ?? null,

      exercises: exercises.map((ex) => ({
        name: ex.exercise_name,
        sets: (ex.sets ?? []).map((s) => ({
          setNumber: s.set_number,
          weightKg: s.weight_kg ?? null,
          reps: s.reps ?? null,
          timeSeconds: s.time_seconds ?? null,
          distance: s.distance ?? null,
        })),
      })),

      prs: [...strengthPrs, ...cardioPbItems],
    };
  }, [
    header,
    stats?.duration_seconds,
    stats?.sets_count,
    stats?.volume_kg,
    stats?.distance_total,
    exercises,
    prs,
    cardioPrs,
  ]);

  if (loading) return <LoadingScreen />;
  if (err) return <ErrorState title="Workout detail failed" message={err} />;
  if (!header) {
    return <ErrorState title="No session" message="Try another workout." />;
  }

  return (
    <Screen>
      <ScreenHeader
        title="Workout"
        right={
          <Pressable
            onPress={() => {
              if (!shareData.title) {
                Alert.alert("Share unavailable", "Missing share data.");
                return;
              }

              setShareOpen(true);
            }}
            style={({ pressed }) => [
              { opacity: pressed ? 0.7 : 1, padding: 6 },
            ]}
            hitSlop={10}
          >
            <Icon name="share-outline" size={20} color={colors.textMuted} />
          </Pressable>
        }
      />

      <ShareWorkoutSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        data={shareData}
        shareUrl={null}
      />

      <ScrollView
        contentContainerStyle={{
          padding: layout.space.lg,
          paddingBottom: 24,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
          />
        }
      >
        <HistorySectionHeader
          title={header.title}
          subtitle={fmtDayTime(header.completed_at)}
          right={
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {fmtMins(stats?.duration_seconds)}
              </Text>
            </View>
          }
        />

        {insight?.label ? (
          <Text style={{ color: colors.textMuted, marginTop: -6 }}>
            {insight.label}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {hasVolume ? (
            <Card style={{ flex: 1, padding: 12, borderRadius: 18 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                VOLUME
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: 20,
                  marginTop: 6,
                }}
              >
                {fmtKg(stats?.volume_kg)} kg
              </Text>
            </Card>
          ) : null}

          {hasDistance ? (
            <Card style={{ flex: 1, padding: 12, borderRadius: 18 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                DISTANCE
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: 20,
                  marginTop: 6,
                }}
              >
                {fmtDistance(stats?.distance_total)}
              </Text>
            </Card>
          ) : null}

          <Card style={{ flex: 1, padding: 12, borderRadius: 18 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>PRS</Text>
            <Text
              style={{
                color: colors.success,
                fontFamily: typography.fontFamily.bold,
                fontSize: 20,
                marginTop: 6,
              }}
            >
              {n0(totalPrs)}
            </Text>
          </Card>
        </View>

        {Platform.OS === "ios" && exercises.filter(ex => /\boutdoor\b/i.test(ex.exercise_name)).flatMap(ex =>
          (ex.sets ?? []).map(set => {
            const legacy = !!header.notes?.includes("outdoor run") && exercises.length === 1 && ex.exercise_name === "Outdoor Run" && set.set_number === 1;
            const slot = routeSlot(ex.exercise_id, ex.order_index ?? 0, set.set_number);
            return <RunHistoryDetail key={slot} name={ex.exercise_name} slot={slot}
              historyId={header.workout_history_id} completedAt={header.completed_at}
              recorded={legacy} distance={set.distance} duration={set.time_seconds} />;
          }))}
        {header.notes ? (
          <Card style={{ padding: 12, borderRadius: 18 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                letterSpacing: 0.8,
              }}
            >
              NOTES
            </Text>
            <Text style={{ color: colors.text, marginTop: 8, fontSize: 14 }}>
              {header.notes}
            </Text>
          </Card>
        ) : null}

        <Card style={{ padding: 12, borderRadius: 18 }}>
          <Text
            style={{
              color: colors.text,
              fontFamily: typography.fontFamily.bold,
              fontSize: 14,
            }}
          >
            Exercises
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 6 }}>
            PR pills only show when you broke your previous best.
          </Text>

          <View style={{ marginTop: 12, gap: 14 }}>
            {exercises.map((ex) => {
              const sets = ex.sets ?? [];
              const singleSet = sets.length === 1 ? sets[0] : null;

              return (
                <View key={ex.exercise_id}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontFamily: typography.fontFamily.bold,
                        fontSize: 16,
                      }}
                    >
                      {ex.exercise_name}
                    </Text>

                    {singleSet ? (
                      <Text
                        numberOfLines={2}
                        style={{
                          color: colors.textMuted,
                          fontSize: 14,
                          textAlign: "right",
                          maxWidth: "55%",
                        }}
                      >
                        {fmtSetSummary(singleSet)}
                      </Text>
                    ) : null}

                    {ex.is_pr ? <PRBadge /> : null}
                  </View>

                  {!singleSet && sets.length ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      {sets.map((st) => (
                        <WorkoutHistoryExerciseRow
                          key={`${ex.exercise_id}-${st.set_number}-${
                            st.set_id ?? "x"
                          }`}
                          name={`Set ${st.set_number}`}
                          summary={fmtSetSummary(st)}
                          isPr={!!st.is_pr}
                          isBest={!!st.is_best}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>

        {cardioPrsCount > 0 ? (
          <Card style={{ padding: 12, borderRadius: 18 }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: typography.fontFamily.bold,
                fontSize: 14,
              }}
            >
              Cardio PBs
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 6 }}>
              Personal bests from this session.
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {cardioPrs.slice(0, 12).map((p) => (
                <View
                  key={p.id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text }} numberOfLines={1}>
                      {fmtCardioMetricLabel(p)}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {p.exercise_name}
                    </Text>
                  </View>

                  <Text style={{ color: colors.textMuted, marginRight: 10 }}>
                    {fmtCardioPRValue(p)}
                  </Text>

                  <PRBadge />
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {prsCount > 0 ? (
          <Card style={{ padding: 12, borderRadius: 18 }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: typography.fontFamily.bold,
                fontSize: 14,
              }}
            >
              Strength PRs
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 6 }}>
              New bests from this session.
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {prs.slice(0, 12).map((p) => (
                <View
                  key={p.exercise_id}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text
                    style={{ flex: 1, color: colors.text }}
                    numberOfLines={1}
                  >
                    {p.exercise_name}
                  </Text>

                  <Text style={{ color: colors.textMuted, marginRight: 10 }}>
                    {p.weight_kg != null && p.reps != null
                      ? `${p.weight_kg} kg × ${p.reps}`
                      : ""}
                  </Text>

                  <PRBadge />
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

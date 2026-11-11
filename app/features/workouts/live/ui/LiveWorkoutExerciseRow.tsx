import { findExerciseDemo } from "@/features/vitalPreview/catalog";
import { ExerciseDemo } from "@/features/vitalPreview/ExerciseDemo";
// app/features/workouts/live/ui/LiveWorkoutExerciseRow.tsx
import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import type { LiveExerciseDraft } from "../state/types";
import {
  getExerciseCtaLabel,
  isExerciseComplete,
  hasSetData,
} from "../state/selectors";
import { getExerciseLoggingProfile } from "../../logging/exerciseLoggingProfile";

function fmtNum(n: number, maxDp = 2) {
  const rounded = Number(n.toFixed(maxDp));
  return rounded.toString();
}

function dropLetter(dropIndex: number) {
  const n = Math.max(1, dropIndex);
  return String.fromCharCode("a".charCodeAt(0) + ((n - 1) % 26));
}

function formatStrength(w: number | null, r: number | null) {
  const reps = r ?? null;
  const weight = w ?? null;

  if (reps != null && weight != null) {
    return `${reps} reps × ${fmtNum(weight)}kg`;
  }

  if (reps != null) return `${reps} reps`;
  if (weight != null) return `${fmtNum(weight)}kg`;

  return "—";
}

function formatDuration(sec: number | null) {
  if (sec == null) return null;

  const total = Math.max(0, Math.round(sec));
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  if (mins <= 0 && secs > 0) return `${secs}s`;
  if (secs === 0) return `${mins} mins`;

  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function formatPace(distance: number | null, timeSeconds: number | null) {
  if (
    distance == null ||
    distance <= 0 ||
    timeSeconds == null ||
    timeSeconds <= 0
  ) {
    return null;
  }

  const pace = timeSeconds / distance;
  const mins = Math.floor(pace / 60);
  const secs = Math.round(pace % 60);

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function formatCardio(distance: number | null, timeSeconds: number | null) {
  const parts: string[] = [];

  const duration = formatDuration(timeSeconds);
  const pace = formatPace(distance, timeSeconds);

  if (duration) parts.push(duration);
  if (distance != null) parts.push(`${fmtNum(distance, 2)}km`);
  if (pace) parts.push(pace);

  return parts.join(" • ") || "—";
}

function formatTimedWeighted(
  weight: number | null,
  timeSeconds: number | null,
) {
  const parts: string[] = [];

  const duration = formatDuration(timeSeconds);

  if (duration) parts.push(duration);
  if (weight != null) parts.push(`${fmtNum(weight)}kg`);

  return parts.join(" • ") || "—";
}

function formatSetByProfile(
  loggingType: ReturnType<typeof getExerciseLoggingProfile>["loggingType"],
  set: {
    weight?: number | null;
    reps?: number | null;
    distance?: number | null;
    timeSeconds?: number | null;
  } | null,
) {
  if (loggingType === "cardio") {
    return formatCardio(set?.distance ?? null, set?.timeSeconds ?? null);
  }

  if (loggingType === "timed" || loggingType === "timed_weighted") {
    return formatTimedWeighted(set?.weight ?? null, set?.timeSeconds ?? null);
  }

  return formatStrength(set?.weight ?? null, set?.reps ?? null);
}

export function LiveWorkoutExerciseRow(props: {
  index: number;
  title: string;
  subtitle: string;
  tags?: string[];
  ex: LiveExerciseDraft;
  onPress: () => void;
}) {
  const { colors, typography } = useAppTheme();

  const complete = isExerciseComplete(props.ex);
  const loggingProfile = getExerciseLoggingProfile(props.ex);
  const loggingType = loggingProfile.loggingType;
  const cta = getExerciseCtaLabel(props.ex);

  const pillTextValue: "Start" | "Continue" | "Done ✓ Edit" = complete
    ? "Done ✓ Edit"
    : cta;

  const pillBorder = complete ? (colors.success ?? "#22c55e") : colors.border;
  const pillBg = complete
    ? (colors.successBg ?? "rgba(34,197,94,0.12)")
    : "transparent";
  const pillText = complete ? (colors.success ?? "#16a34a") : colors.text;

  const completedBlocks = useMemo(() => {
    if (!complete) return [];

    const rows = (props.ex.sets ?? [])
      .filter((s) => hasSetData(props.ex, s))
      .slice()
      .sort((a, b) => {
        if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
        return (a.dropIndex ?? 0) - (b.dropIndex ?? 0);
      });

    const bySet = new Map<number, typeof rows>();

    for (const r of rows) {
      const key = r.setNumber;
      if (!bySet.has(key)) bySet.set(key, []);
      bySet.get(key)!.push(r);
    }

    return Array.from(bySet.entries()).map(([setNumber, group]) => {
      const base = group.find((x) => (x.dropIndex ?? 0) === 0) ?? null;

      const drops = group
        .filter((x) => (x.dropIndex ?? 0) > 0)
        .sort((a, b) => (a.dropIndex ?? 0) - (b.dropIndex ?? 0));

      const baseLabel = formatSetByProfile(loggingType, base);

      const dropLabels = drops.map((drop) => ({
        dropIndex: drop.dropIndex ?? 0,
        label: formatSetByProfile(loggingType, drop),
      }));

      return { setNumber, baseLabel, dropLabels };
    });
  }, [complete, props.ex, loggingType]);

  return (
    <View
      style={{
        backgroundColor: colors.bg ?? colors.surface,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {findExerciseDemo(props.ex.exerciseId) ? (
          <ExerciseDemo
            exerciseId={props.ex.exerciseId}
            name={props.title}
            compact
          />
        ) : (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontFamily: typography.fontFamily.bold,
                color: colors.text,
              }}
            >
              {props.index}
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pillTextValue}: ${props.title}`}
          onPress={props.onPress}
          style={{ flex: 1, flexDirection: "row", alignItems: "flex-start" }}
        >
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text
              style={{
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.size.body,
                color: colors.text,
              }}
              numberOfLines={2}
            >
              {props.title}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.size.sub,
                  color: colors.textMuted,
                }}
              >
                {props.subtitle}
              </Text>

              {!!props.tags?.length && (
                <>
                  <Text
                    style={{ color: colors.textMuted, marginHorizontal: 6 }}
                  >
                    •
                  </Text>
                  <Text
                    style={{
                      fontFamily: typography.fontFamily.semibold,
                      fontSize: typography.size.sub,
                      color: colors.primary,
                    }}
                  >
                    {props.tags.join(" • ")}
                  </Text>
                </>
              )}
            </View>
          </View>

          <View
            style={{
              borderWidth: 2,
              borderColor: pillBorder,
              backgroundColor: pillBg,
              borderRadius: 999,
              paddingVertical: 8,
              paddingHorizontal: 10,
              minWidth: 70,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontFamily: typography.fontFamily.bold,
                color: pillText,
              }}
            >
              {pillTextValue}
            </Text>
          </View>
        </Pressable>
      </View>

      {complete && completedBlocks.length > 0 && (
        <View style={{ marginTop: 14, paddingLeft: 46, gap: 10 }}>
          {completedBlocks.slice(0, 12).map((block) => {
            const hideSetNumber =
              loggingType === "cardio" && completedBlocks.length === 1;

            return (
              <View key={`set-${block.setNumber}`} style={{ gap: 6 }}>
                <Text
                  key={`${block.setNumber}-0`}
                  style={{
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.size.body,
                    color: colors.text,
                  }}
                >
                  {hideSetNumber
                    ? block.baseLabel
                    : `${block.setNumber}. ${block.baseLabel}`}
                </Text>

                {block.dropLabels.length > 0 && (
                  <View
                    style={{
                      paddingLeft: 18,
                      flexDirection: "row",
                      flexWrap: "wrap",
                    }}
                  >
                    {block.dropLabels.map((drop) => (
                      <Text
                        key={`${block.setNumber}-${drop.dropIndex}`}
                        style={{
                          fontFamily: typography.fontFamily.regular,
                          fontSize: typography.size.sub,
                          color: colors.textMuted,
                          marginRight: 14,
                          marginBottom: 6,
                        }}
                      >
                        {dropLetter(drop.dropIndex)}. {drop.label}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// live/modals/sections/StrengthStatsCards.tsx
import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { fmtKg } from "../helpers/format";

import type { StrengthTarget } from "@/lib/plans/goalRoadmap";
import { targetFeedback, targetLabel } from "../helpers/sessionTarget";

type BestSet6m = {
  completedAt: string | null;
  weight: number | null;
  reps: number | null;
  e1rm: number | null;
} | null;

function fmtDateShort(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  // simple + consistent; avoid locale surprises
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

function fmtE1rm(e1rm: number) {
  // round to nearest 1kg; change if you prefer 0.5kg
  return `${Math.round(e1rm)}kg`;
}

export function StrengthStatsCards(props: {
  colors: any;
  typography: any;
  sessionVolume: number;
  targets: StrengthTarget[];
  sets: Array<{ weight: number | null; reps: number | null }>;
  compareStrength: boolean;
  showVolume: boolean;

  // session best set (for delta vs best)
  bestNow: { weight: number; reps: number } | null;

  volDelta: number | null;
  prDelta: number | null;

  // ✅ NEW (Option 2)
  bestE1rm6m: number | null;
  bestSet6m?: BestSet6m;
}) {
  const { colors, typography } = props;

  const bestLabel = useMemo(() => {
    if (!props.bestSet6m) return null;

    const w = props.bestSet6m.weight;
    const r = props.bestSet6m.reps;
    if (w == null || r == null) return null;

    return `${fmtKg(w)} × ${r}`;
  }, [props.bestSet6m]);

  const bestDate = useMemo(() => {
    return fmtDateShort(props.bestSet6m?.completedAt ?? null);
  }, [props.bestSet6m]);

  const headlineE1rm = props.bestE1rm6m ?? null;

  // Session best e1RM (computed from bestNow) so we can show "vs best"
  const sessionBestE1rm = useMemo(() => {
    if (!props.bestNow) return null;
    const w = props.bestNow.weight;
    const r = props.bestNow.reps;
    if (w == null || r == null || r <= 0) return null;
    return w * (1 + r / 30);
  }, [props.bestNow]);

  const vsText = useMemo(() => {
    if (!headlineE1rm) return "no history";

    // If we have a delta from the caller, use it (most accurate to your existing logic)
    if (props.prDelta != null) {
      if (props.prDelta > 0) return `+${Math.round(props.prDelta)}kg vs best`;
      if (props.prDelta < 0) return `${Math.round(props.prDelta)}kg vs best`;
      return `matched best`;
    }

    // Fallback: compute delta using sessionBestE1rm
    if (sessionBestE1rm == null) return "best in last 6 months";
    const delta = sessionBestE1rm - headlineE1rm;
    if (delta > 0) return `+${Math.round(delta)}kg vs best`;
    if (delta < 0) return `${Math.round(delta)}kg vs best`;
    return "matched best";
  }, [headlineE1rm, props.prDelta, sessionBestE1rm]);

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 6,
      }}
    >
      {/* Session Volume */}
      {props.showVolume && (
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface ?? colors.bg,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text
            style={{ color: colors.textMuted, fontSize: typography.size.sub }}
          >
            Session Vol
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontFamily: typography.fontFamily.bold,
              fontSize: 26,
              color: colors.text,
            }}
            numberOfLines={1}
          >
            {Math.round(props.sessionVolume)} kg
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              marginTop: 6,
              fontSize: typography.size.sub,
            }}
            numberOfLines={1}
          >
            {props.volDelta == null
              ? "no last session"
              : props.volDelta > 0
                ? `+${Math.round(props.volDelta)}kg vs last`
                : props.volDelta < 0
                  ? `${Math.round(props.volDelta)}kg vs last`
                  : "matched last"}
          </Text>
        </View>
      )}

      {/* Best PR (6 months) */}
      <View
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface ?? colors.bg,
          borderRadius: 18,
          padding: 14,
        }}
      >
        <Text
          style={{ color: colors.textMuted, fontSize: typography.size.sub }}
        >
          {props.targets.length ? "Today’s target" : "Best (6 mo)"}
        </Text>

        {props.targets.length ? (
          props.targets.map((target) => (
            <View key={target.goalId} style={{ marginTop: 8, gap: 6 }}>
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{
                  fontSize: 24,
                  color: colors.text,
                  fontFamily: typography.fontFamily.bold,
                }}
              >
                {targetLabel(target)}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typography.size.sub,
                }}
              >
                {targetFeedback(target, props.sets, props.compareStrength)}
              </Text>
            </View>
          ))
        ) : (
          <>
            <Text
              style={{
                marginTop: 8,
                fontFamily: typography.fontFamily.bold,
                fontSize: 26,
                color: colors.text,
              }}
              numberOfLines={1}
            >
              {headlineE1rm != null ? fmtE1rm(headlineE1rm) : "—"}
            </Text>

            {/* Supporting line: show the set + date if we have it */}
            <Text
              style={{
                color: colors.textMuted,
                marginTop: 6,
                fontSize: typography.size.sub,
              }}
              numberOfLines={1}
            >
              {headlineE1rm == null
                ? "no history"
                : bestLabel
                  ? bestDate
                    ? `${bestLabel} • ${bestDate}`
                    : bestLabel
                  : "best in last 6 months"}
            </Text>

            <Text
              style={{
                color: colors.textMuted,
                marginTop: 6,
                fontSize: typography.size.sub,
              }}
              numberOfLines={1}
            >
              {vsText}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

// app/features/social/feed/posts/PrPostCard.tsx

import React, { useMemo } from "react";
import { Pressable, View, Text, StyleSheet, ViewStyle } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import type { FeedRow } from "../types";
import { UserMetaRow } from "../components/UserMetaRow";
import { FeedActionsRow } from "../components/FeedActionsRow";
import { fmtInt, toNumber } from "../utils/format";

type Props = {
  item: FeedRow;

  onToggleLike?: (postId: string) => void;
  onOpenComments?: (post: FeedRow) => void;
  onOpenPost?: (post: FeedRow) => void;

  showHeader?: boolean;
  showActions?: boolean;
  containerStyle?: ViewStyle;
};

type ParsedPr = {
  exerciseName: string | null;
  value: number | null;
  unit: string;
  reps: number | null;
  delta: number | null;
  prevBest: number | null;
  estimated1RM: number | null;
};

function parsePrFromSnapshot(item: FeedRow): ParsedPr {
  const s: any = item.pr_snapshot ?? {};

  const exerciseName =
    (s.exercise_name as string | undefined) ?? item.exercise_name ?? null;

  // ✅ Prefer new snapshot shape first, then fall back to old shape
  const weightRaw =
    s.weight ?? s.recent_best_weight ?? s.recentBestWeight ?? null;

  const prevBestRaw =
    s.previous_best_weight ?? s.prev_best_weight ?? s.prevBestWeight ?? null;

  const deltaRaw = s.delta_weight ?? s.pr_delta ?? s.delta ?? null;

  const repsRaw = s.reps ?? s.recent_best_reps ?? null;

  const estimated1RMRaw = s.estimated_1rm ?? s.estimated1RM ?? null;

  const value = weightRaw == null ? null : toNumber(weightRaw);
  const prevBest = prevBestRaw == null ? null : toNumber(prevBestRaw);
  const delta = deltaRaw == null ? null : toNumber(deltaRaw);
  const reps = repsRaw == null ? null : Math.max(0, toNumber(repsRaw));
  const estimated1RM =
    estimated1RMRaw == null ? null : toNumber(estimated1RMRaw);

  const unit = (s.unit ?? "kg") as string;

  return {
    exerciseName,
    value,
    unit,
    reps,
    delta,
    prevBest,
    estimated1RM,
  };
}

export function PrPostCard({
  item,
  onToggleLike,
  onOpenComments,
  onOpenPost,
  showHeader = true,
  showActions = true,
  containerStyle,
}: Props) {
  const { colors, typography, layout } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.xl ?? layout.radius.lg,
          padding: layout.space.lg,
          marginBottom: layout.space.md,
        },

        prWrap: {
          marginTop: showHeader ? layout.space.lg : 0,
          borderRadius: layout.radius.lg,
          backgroundColor: colors.surface,
          alignItems: "center",
          paddingVertical: layout.space.lg,
          paddingHorizontal: layout.space.md,
        },

        exercise: {
          color: colors.primary,
          fontFamily: typography.fontFamily.bold,
          fontSize: 14,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 10,
          textAlign: "center",
        },

        bigRow: {
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 10,
        },

        bigValue: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: 64,
          lineHeight: 68,
          letterSpacing: -1,
          textAlign: "center",
        },

        unit: {
          color: colors.primary,
          fontFamily: typography.fontFamily.bold,
          fontSize: 40,
          lineHeight: 68,
          marginBottom: 8,
        },

        reps: {
          marginTop: 6,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: 16,
          lineHeight: 20,
          textAlign: "center",
        },

        secondary: {
          marginTop: 10,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
          textAlign: "center",
        },

        deltaChip: {
          marginTop: layout.space.md,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "rgba(34,197,94,0.12)",
        },

        deltaText: {
          color: "rgb(22,163,74)",
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        caption: {
          marginTop: layout.space.md,
          color: colors.text,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
          textAlign: "center",
          paddingHorizontal: layout.space.md,
        },

        actions: { marginTop: layout.space.lg },
      }),
    [colors, typography, layout, showHeader],
  );

  const pr = parsePrFromSnapshot(item);

  const exName = (pr.exerciseName ?? "Exercise").toUpperCase();
  const valueLabel = pr.value == null ? "—" : fmtInt(pr.value);
  const unitLabel = pr.unit ?? "kg";
  const repsLabel = pr.reps != null ? `x ${fmtInt(pr.reps)}` : null;

  const estimatedLabel =
    pr.estimated1RM != null
      ? `Estimated 1RM: ${fmtInt(pr.estimated1RM)} ${unitLabel}`
      : null;

  const deltaLabel =
    pr.delta != null
      ? `${pr.delta > 0 ? "+" : ""}${fmtInt(pr.delta)} ${unitLabel} over previous best`
      : null;

  const postContent = (
    <>
      {showHeader ? (
        <UserMetaRow
          name={item.user_name ?? "User"}
          username={item.user_username}
          createdAt={item.created_at}
          subtitleLeft="New Personal Record"
        />
      ) : null}

      <View style={styles.prWrap}>
        <Text style={styles.exercise} numberOfLines={2}>
          {exName}
        </Text>

        <View style={styles.bigRow}>
          <Text style={styles.bigValue}>{valueLabel}</Text>
          <Text style={styles.unit}>{unitLabel}</Text>
          {!!repsLabel && <Text style={styles.reps}>{repsLabel} reps</Text>}
        </View>

        {!!estimatedLabel && (
          <Text style={styles.secondary}>{estimatedLabel}</Text>
        )}

        {!!deltaLabel && (
          <View style={styles.deltaChip}>
            <Text style={styles.deltaText}>{deltaLabel}</Text>
          </View>
        )}
      </View>

      {!!item.caption && <Text style={styles.caption}>{item.caption}</Text>}
    </>
  );

  return (
    <View style={[styles.card, containerStyle]}>
      {onOpenPost ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open post details"
          onPress={() => onOpenPost(item)}
        >
          {postContent}
        </Pressable>
      ) : (
        postContent
      )}

      {showActions ? (
        <View style={styles.actions}>
          <FeedActionsRow
            likeCount={item.like_count}
            commentCount={item.comment_count}
            viewerLiked={item.viewer_liked}
            onPressLike={() => onToggleLike?.(item.post_id)}
            onPressComments={() => onOpenComments?.(item)}
            onPressShare={() => {}}
          />
        </View>
      ) : null}
    </View>
  );
}

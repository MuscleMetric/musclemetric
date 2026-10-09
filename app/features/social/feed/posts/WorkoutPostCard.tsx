// app/features/social/feed/posts/WorkoutPostCard.tsx

import React, { useMemo } from "react";
import { Pressable, View, Text, StyleSheet, ViewStyle } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import type { FeedRow } from "../types";
import { UserMetaRow } from "../components/UserMetaRow";
import { FeedActionsRow } from "../components/FeedActionsRow";
import { fmtVolume, toNumber } from "../utils/format";
import { WorkoutCover } from "@/ui/media/WorkoutCover";

type Props = {
  item: FeedRow;

  // ✅ make optional so modal can reuse without wiring actions
  onToggleLike?: (postId: string) => void;
  onOpenComments?: (post: FeedRow) => void;
  onOpenPost?: (post: FeedRow) => void;

  // ✅ chrome toggles for modal reuse
  showHeader?: boolean; // default true
  showActions?: boolean; // default true

  // ✅ allow modal to override spacing (e.g., remove marginBottom)
  containerStyle?: ViewStyle;
};

function upperOrFallback(s?: string | null, fallback = "WORKOUT") {
  const v = (s ?? "").trim();
  return v.length ? v.toUpperCase() : fallback;
}

export function WorkoutPostCard({
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
          overflow: "hidden",
          marginBottom: layout.space.md,
        },

        headerPad: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.lg,
          paddingBottom: layout.space.md,
        },

        bannerWrap: {
          paddingHorizontal: layout.space.lg,
          paddingBottom: layout.space.md,
        },

        workoutWrap: {
          paddingTop: layout.space.lg,
          paddingBottom: layout.space.md,
        },

        statsPill: {
          marginTop: layout.space.md,
          marginHorizontal: layout.space.lg,
          marginBottom: layout.space.md,
          borderRadius: 999,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        },

        statCol: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },

        divider: {
          width: 1,
          alignSelf: "stretch",
          backgroundColor: colors.border,
          opacity: 0.8,
        },

        statLabel: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 4,
        },

        statValueRow: {
          flexDirection: "row",
          alignItems: "baseline",
          gap: 6,
        },

        statValue: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: 18,
          lineHeight: 22,
        },

        unit: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        caption: {
          marginTop: layout.space.sm,
          marginHorizontal: layout.space.lg,
          color: colors.text,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
          textAlign: "center",
          paddingHorizontal: layout.space.md,
        },

        actionsPad: {
          paddingHorizontal: layout.space.lg,
          paddingBottom: layout.space.lg,
        },
      }),
    [colors, typography, layout]
  );

  const ws = item.workout_snapshot;

  const volume = fmtVolume(ws?.total_volume ?? 0);
  const sets = String(Math.max(0, toNumber(ws?.sets_count ?? 0)));
  const exercises = String(Math.max(0, toNumber(ws?.exercises_count ?? 0)));

  const workoutTitle = upperOrFallback(ws?.workout_title, "WORKOUT");

  // ✅ local assets key used by WorkoutCover resolver
  const imageKey = ws?.workout_image_key ?? null;

  const postContent = (
    <>
      {showHeader ? (
        <View style={styles.headerPad}>
          <UserMetaRow
            name={item.user_name ?? "User"}
            username={item.user_username}
            createdAt={item.created_at}
          />
        </View>
      ) : null}

      <View style={styles.workoutWrap}>
        {/* BANNER */}
        <View style={styles.bannerWrap}>
          <WorkoutCover
            imageKey={imageKey}
            title={workoutTitle}
            variant="banner"
            height={190}
            focusY={0.42}
            zoom={1.05}
            radius={layout.radius.lg}
          />
        </View>

        {/* STATS */}
        <View style={styles.statsPill}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>VOLUME</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>{volume}</Text>
              <Text style={styles.unit}>kg</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statCol}>
            <Text style={styles.statLabel}>SETS</Text>
            <Text style={styles.statValue}>{sets}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statCol}>
            <Text style={styles.statLabel}>EXERCISES</Text>
            <Text style={styles.statValue}>{exercises}</Text>
          </View>
        </View>

        {!!item.caption && <Text style={styles.caption}>{item.caption}</Text>}
      </View>
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

      {/* ACTIONS */}
      {showActions ? (
        <View style={styles.actionsPad}>
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

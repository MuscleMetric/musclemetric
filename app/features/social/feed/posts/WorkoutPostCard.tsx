// app/features/social/feed/posts/WorkoutPostCard.tsx

import React, { useMemo } from "react";
import { Pressable, View, Text, StyleSheet, ViewStyle } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import type { FeedRow } from "../types";
import { UserMetaRow } from "../components/UserMetaRow";
import { FeedActionsRow } from "../components/FeedActionsRow";
import { workoutSummary } from "../utils/workoutSummary";
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

  const stats = workoutSummary(ws);

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
          {stats.map((stat, index) => (
            <React.Fragment key={stat.label}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.statCol}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <View style={styles.statValueRow}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  {stat.unit && <Text style={styles.unit}>{stat.unit}</Text>}
                </View>
              </View>
            </React.Fragment>
          ))}
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
          accessibilityHint="Opens post details"
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

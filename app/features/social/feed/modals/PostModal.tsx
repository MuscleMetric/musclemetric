// app/features/social/feed/modals/PostModal.tsx

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/lib/useAppTheme";
import type { FeedRow } from "../types";
import type { CommentRow, WorkoutDetailsPayload } from "./types";
import { CommentsList } from "./CommentsList";
import { CommentComposer } from "./CommentComposer";

// ✅ reuse existing post cards for preview
import { PrPostCard } from "../posts/PrPostCard";
import { PostRouteDetails } from "@/features/cardio/PostRoute";
import { WorkoutDetails } from "./WorkoutDetails";

import { log } from "@/lib/logger";

type Props = {
  visible: boolean;
  post: FeedRow | null;
  onClose: () => void;

  fetchComments: (postId: string) => Promise<CommentRow[]>;
  addComment: (postId: string, body: string) => Promise<void>;

  fetchWorkoutDetails?: (
    postId: string,
  ) => Promise<WorkoutDetailsPayload | null>;
};

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function PostModal({
  visible,
  post,
  onClose,
  fetchComments,
  addComment,
  fetchWorkoutDetails, // reserved for later
}: Props) {
  const { colors, typography, layout } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
          padding: layout.space.lg,
        },

        container: {
          width: "100%",
          maxWidth: 800,
          height: "80%",
          backgroundColor: colors.surface,
          borderRadius: layout.radius.xl ?? 24,
          overflow: "hidden",
        },

        safe: { flex: 1 },

        header: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.md,
          paddingBottom: layout.space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },

        headerLeftGroup: {
          flexDirection: "row",
          alignItems: "center",
          flex: 1,
        },

        avatar: {
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: layout.space.md,
        },

        avatarText: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.body,
        },

        headerTextWrap: {
          flex: 1,
        },

        headerHandle: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
        },

        headerName: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.body,
        },

        close: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },

        closeText: {
          color: colors.textMuted,
          fontSize: 16,
          fontFamily: typography.fontFamily.semibold,
        },

        headerLeft: { flex: 1 },

        listContent: {
          paddingHorizontal: layout.space.lg,
          paddingVertical: layout.space.lg,
          gap: layout.space.md,
        },

        sectionTitleRow: {
          marginTop: layout.space.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        sectionTitle: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.body,
        },
        sectionMeta: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
        },

        commentsWrap: {
          marginTop: layout.space.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: layout.radius.lg,
          backgroundColor: colors.bg,
          overflow: "hidden",
        },
      }),
    [colors, typography, layout],
  );

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const [workoutDetails, setWorkoutDetails] =
    useState<WorkoutDetailsPayload | null>(null);
  const [loadingWorkoutDetails, setLoadingWorkoutDetails] = useState(false);

  const loadComments = useCallback(async () => {
    if (!post) return;
    setLoadingComments(true);
    try {
      const data = await fetchComments(post.post_id);
      log("loaded comments", data);
      setComments(data);
    } catch (e) {
      log("loadComments error", e);
    } finally {
      setLoadingComments(false);
    }
  }, [post, fetchComments]);

  const loadWorkoutDetails = useCallback(async () => {
    if (!post || post.post_type !== "workout" || !fetchWorkoutDetails) {
      setWorkoutDetails(null);
      return;
    }

    setLoadingWorkoutDetails(true);

    try {
      const data = await fetchWorkoutDetails(post.post_id);
      setWorkoutDetails(data);
    } catch (e) {
      log("loadWorkoutDetails error", e);
      setWorkoutDetails(null);
    } finally {
      setLoadingWorkoutDetails(false);
    }
  }, [post, fetchWorkoutDetails]);

  useEffect(() => {
    if (!visible || !post) return;

    loadComments();

    if (post.post_type === "workout") {
      loadWorkoutDetails();
    } else {
      setWorkoutDetails(null);
      setLoadingWorkoutDetails(false);
    }
  }, [visible, post, loadComments, loadWorkoutDetails]);

  log("PostModal render", {
    visible,
    postId: post?.post_id ?? null,
    commentsLength: comments.length,
    loadingComments,
  });

  if (!post) return null;

  const handle = post.user_username ? `@${post.user_username}` : "@user";
  const displayName = post.user_name ?? "User";

  const renderPostPreview = () => {
    if (post.post_type === "workout") {
      return (
        <PostRouteDetails key={post.post_id} postId={post.post_id} audience={post.visibility}
          name={workoutDetails?.exercises.find(ex => /outdoor/i.test(ex.exercise_name ?? ""))?.exercise_name ?? "Outdoor workout"}
          mixed={post.workout_snapshot?.workout_kind === "mixed" || (workoutDetails?.exercises.length ?? 0) > 1}
          fallback={<WorkoutDetails loading={loadingWorkoutDetails} data={workoutDetails} />} />
      );
    }

    if (post.post_type === "pr") {
      return (
        <PrPostCard
          item={post}
          onOpenComments={() => {}}
          showHeader={false}
          showActions={false}
        />
      );
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <SafeAreaView style={styles.safe}>
            {/* HEADER: @username title, name under */}
            <View style={styles.header}>
              <View style={styles.headerLeftGroup}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {getInitials(displayName)}
                  </Text>
                </View>

                <View style={styles.headerTextWrap}>
                  <Text style={styles.headerHandle} numberOfLines={1}>
                    {handle}
                  </Text>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {displayName}
                  </Text>
                </View>
              </View>

              <Pressable onPress={onClose} style={styles.close} hitSlop={10}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* SCROLL AREA: post preview + comments */}
            <ScrollView
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              <View>
                {renderPostPreview()}

                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Comments</Text>
                  <Text style={styles.sectionMeta}>
                    {post.comment_count ?? comments.length}
                  </Text>
                </View>

                <View style={styles.commentsWrap}>
                  <CommentsList comments={comments} loading={loadingComments} />
                </View>
              </View>
            </ScrollView>

            {/* COMPOSER pinned */}
            <CommentComposer
              onSubmit={async (body) => {
                // optimistic insert at top
                const tempId = `temp_${Date.now()}`;
                const optimistic: CommentRow = {
                  id: tempId,
                  post_id: post.post_id,
                  user_id: "me",
                  user_name: "You",
                  user_username: null,
                  body,
                  created_at: new Date().toISOString(),
                };

                setComments((prev) => [optimistic, ...prev]);

                try {
                  await addComment(post.post_id, body);
                  // refresh from server after sending (optional but keeps IDs correct)
                  await loadComments();
                } catch (e) {
                  setComments((prev) => prev.filter((c) => c.id !== tempId));
                  throw e;
                }
              }}
            />
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

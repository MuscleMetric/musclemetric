import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "@/lib/supabase";
import ProfileModalContent from "@/app/features/social/profile/ProfileModalContent";
import { PostModal } from "@/app/features/social/feed/modals/PostModal";

import type { FeedRow } from "@/app/features/social/feed/types";
import type {
  CommentRow,
  WorkoutDetailsPayload,
} from "@/app/features/social/feed/modals/types";

import { log } from "@/lib/logger";

type NotificationType =
  | "followed_you"
  | "follow_request_received"
  | "follow_request_accepted"
  | "post_liked"
  | "post_commented"
  | "following_posted_pr"
  | "following_posted_workout"
  | "feedback_in_progress"
  | "feedback_released";

type EntityType = "profile" | "follow_request" | "post" | "comment" | "feedback";

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  entity_type: EntityType;
  entity_id: string;
  image_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type ProfileLite = {
  id: string;
  name: string | null;
  username: string | null;
};

type CommentProfileJoinRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles:
    | {
        name: string | null;
        username: string | null;
      }
    | {
        name: string | null;
        username: string | null;
      }[]
    | null;
};

export default function InboxScreen() {
  const { colors, typography, layout } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.bg },

        header: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.sm,
          paddingBottom: layout.space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },

        headerTitleWrap: {
          flex: 1,
        },

        headerTitle: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.h2,
          lineHeight: typography.lineHeight.h2,
        },

        headerSub: {
          marginTop: 2,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        backBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },

        markAllBtn: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },

        markAllText: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        listContent: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.md,
          paddingBottom: layout.space.xxl,
          flexGrow: 1,
        },

        card: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.lg,
          padding: layout.space.lg,
          marginBottom: layout.space.md,
        },

        unread: {
          borderColor: colors.primary,
          backgroundColor: colors.surface,
        },

        topRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        },

        actor: {
          flex: 1,
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
        },

        typePill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },

        typeText: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        message: {
          marginTop: 10,
          color: colors.text,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
        },

        body: {
          marginTop: 6,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          lineHeight: typography.lineHeight.sub,
        },

        meta: {
          marginTop: 12,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        footerRow: {
          marginTop: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        },

        badge: {
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        },

        badgeText: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        ctaText: {
          color: colors.primary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        emptyWrap: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: layout.space.lg,
        },

        emptyTitle: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.h3,
          lineHeight: typography.lineHeight.h3,
          textAlign: "center",
        },

        emptySub: {
          marginTop: 8,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          lineHeight: typography.lineHeight.sub,
          textAlign: "center",
        },

        errorText: {
          marginTop: 8,
          color: colors.danger,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          lineHeight: typography.lineHeight.sub,
          textAlign: "center",
        },
      }),
    [colors, typography, layout],
  );

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [actorMap, setActorMap] = useState<Record<string, ProfileLite>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );

  const [selectedPost, setSelectedPost] = useState<FeedRow | null>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    const res = await supabase.rpc("get_my_unread_notification_count");
    if (!res.error && typeof res.data === "number") {
      setUnreadCount(res.data);
    }
  }, []);

  const fetchActorProfiles = useCallback(async (items: NotificationRow[]) => {
    const actorIds = Array.from(
      new Set(items.map((item) => item.actor_id).filter(Boolean)),
    ) as string[];

    if (actorIds.length === 0) {
      setActorMap({});
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, username")
      .in("id", actorIds);

    if (error) {
      log("profiles fetch error:", error);
      setActorMap({});
      return;
    }

    const nextMap: Record<string, ProfileLite> = {};
    for (const profile of (data ?? []) as ProfileLite[]) {
      nextMap[profile.id] = profile;
    }
    setActorMap(nextMap);
  }, []);

  const load = useCallback(async () => {
    setErrorMsg(null);

    const notificationsRes = await supabase.rpc("get_my_notifications", {
      p_limit: 50,
      p_before: null,
    });

    if (notificationsRes.error) {
      log("get_my_notifications error:", notificationsRes.error);
      setRows([]);
      setActorMap({});
      setUnreadCount(0);
      setErrorMsg("Could not load notifications.");
      return;
    }

    const items = ((notificationsRes.data as NotificationRow[]) ?? []).map(
      (item) => ({
        ...item,
      }),
    );

    setRows(items);

    await Promise.all([fetchActorProfiles(items), fetchUnreadCount()]);
  }, [fetchActorProfiles, fetchUnreadCount]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      await load();
      if (active) setLoading(false);
    };

    run();

    return () => {
      active = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const getActorLabel = useCallback(
    (item: NotificationRow) => {
      if (!item.actor_id) return "System";
      const actor = actorMap[item.actor_id];
      return actor?.username?.trim() || actor?.name?.trim() || "Someone";
    },
    [actorMap],
  );

  const getTypeLabel = useCallback((type: NotificationType) => {
    switch (type) {
      case "feedback_in_progress":
      case "feedback_released":
        return "Your feedback";
      case "followed_you":
        return "Follow";
      case "follow_request_received":
        return "Request";
      case "follow_request_accepted":
        return "Accepted";
      case "post_liked":
        return "Like";
      case "post_commented":
        return "Comment";
      case "following_posted_pr":
        return "PR";
      case "following_posted_workout":
        return "Workout";
      default:
        return "Notification";
    }
  }, []);

  const fetchComments = useCallback(
    async (postId: string): Promise<CommentRow[]> => {
      const { data, error } = await supabase
        .from("post_comments")
        .select(
          `
            id,
            post_id,
            user_id,
            body,
            created_at,
            profiles:user_id (
              name,
              username
            )
          `,
        )
        .eq("post_id", postId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        log("fetchComments error:", error);
        return [];
      }

      return ((data ?? []) as CommentProfileJoinRow[]).map((row) => {
        const profile = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;

        return {
          id: row.id,
          post_id: row.post_id,
          user_id: row.user_id,
          user_name: profile?.name ?? "User",
          user_username: profile?.username ?? null,
          body: row.body,
          created_at: row.created_at,
        };
      });
    },
    [],
  );

  const addComment = useCallback(
    async (postId: string, body: string): Promise<void> => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const { error } = await supabase.from("post_comments").insert({
        post_id: postId,
        body: trimmed,
      });

      if (error) {
        log("addComment error:", error);
        throw error;
      }

      setSelectedPost((prev) =>
        prev
          ? {
              ...prev,
              comment_count: (prev.comment_count ?? 0) + 1,
            }
          : prev,
      );

      setRows((prev) =>
        prev.map((row) =>
          row.entity_id === postId &&
          (row.type === "post_liked" ||
            row.type === "post_commented" ||
            row.type === "following_posted_pr" ||
            row.type === "following_posted_workout")
            ? { ...row }
            : row,
        ),
      );
    },
    [],
  );

  const fetchWorkoutDetails = useCallback(
    async (_postId: string): Promise<WorkoutDetailsPayload | null> => {
      return null;
    },
    [],
  );

  const openPostFromNotification = useCallback(async (postId: string) => {
    const res = await supabase
      .rpc("get_post_detail_v1", { p_post_id: postId })
      .single();

    if (res.error) {
      log("get_post_detail_v1 error:", res.error);
      Alert.alert("Could not open post", "Please try again.");
      return;
    }

    if (!res.data) {
      Alert.alert("Post unavailable", "This post could not be found.");
      return;
    }

    setSelectedPost(res.data as FeedRow);
    setPostModalVisible(true);
  }, []);

  const navigateFromNotification = useCallback(
    (item: NotificationRow) => {
      switch (item.type) {
        case "feedback_in_progress":
        case "feedback_released":
          Alert.alert(item.title, item.body);
          return;
        case "followed_you":
        case "follow_request_accepted": {
          if (item.actor_id) {
            setSelectedProfileId(item.actor_id);
          }
          return;
        }

        case "follow_request_received": {
          Alert.alert(
            "Coming soon",
            "Follow requests will be handled here soon.",
          );
          return;
        }

        case "post_liked":
        case "post_commented":
        case "following_posted_pr":
        case "following_posted_workout": {
          if (item.entity_id) {
            void openPostFromNotification(item.entity_id);
          }
          return;
        }

        default:
          return;
      }
    },
    [openPostFromNotification],
  );

  const handlePressNotification = useCallback(
    async (item: NotificationRow) => {
      if (!item.is_read) {
        const markRes = await supabase.rpc("mark_notification_read", {
          p_notification_id: item.id,
        });

        if (markRes.error) {
          log("mark_notification_read error:", markRes.error);
        } else {
          setRows((prev) =>
            prev.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    is_read: true,
                    read_at: new Date().toISOString(),
                  }
                : row,
            ),
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }

      navigateFromNotification(item);
    },
    [navigateFromNotification],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (rows.length === 0 || unreadCount === 0 || markingAll) return;

    setMarkingAll(true);

    const res = await supabase.rpc("mark_all_notifications_read");

    if (res.error) {
      log("mark_all_notifications_read error:", res.error);
      Alert.alert("Could not update notifications", "Please try again.");
      setMarkingAll(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        is_read: true,
        read_at: row.read_at ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);
    setMarkingAll(false);
  }, [markingAll, rows.length, unreadCount]);

  const renderItem = ({ item }: { item: NotificationRow }) => {
    const actorLabel = getActorLabel(item);

    return (
      <Pressable
        onPress={() => handlePressNotification(item)}
        style={({ pressed }) => [
          styles.card,
          !item.is_read && styles.unread,
          { opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={styles.actor} numberOfLines={1}>
            {actorLabel}
          </Text>

          <View style={styles.typePill}>
            <Text style={styles.typeText}>{getTypeLabel(item.type)}</Text>
          </View>
        </View>

        <Text style={styles.message}>{item.title}</Text>

        {!!item.body && <Text style={styles.body}>{item.body}</Text>}

        <Text style={styles.meta}>
          {new Date(item.created_at).toLocaleString()}
        </Text>

        <View style={styles.footerRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {item.is_read ? "Read" : "Unread"}
            </Text>
          </View>

          <Text style={styles.ctaText}>Open</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={["top", "left", "right"]}
      >
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              hitSlop={10}
            >
              <ChevronLeft size={18} color={colors.text} />
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Inbox</Text>
              <Text style={styles.headerSub}>
                {unreadCount === 0
                  ? "All caught up"
                  : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
              </Text>
            </View>

            <Pressable
              onPress={handleMarkAllRead}
              disabled={unreadCount === 0 || markingAll}
              style={({ pressed }) => [
                styles.markAllBtn,
                {
                  opacity:
                    unreadCount === 0 || markingAll ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.markAllText}>
                {markingAll ? "Updating..." : "Read all"}
              </Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.text}
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTitle}>No notifications yet</Text>
                  <Text style={styles.emptySub}>
                    Follows, likes, comments, and post activity will appear
                    here.
                  </Text>
                  {!!errorMsg && (
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  )}
                </View>
              }
            />
          )}
        </View>
      </SafeAreaView>

      <Modal
        visible={!!selectedProfileId}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setSelectedProfileId(null)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.bg }}
          edges={["top", "bottom", "left", "right"]}
        >
          {selectedProfileId ? (
            <ProfileModalContent
              profileId={selectedProfileId}
              onClose={() => setSelectedProfileId(null)}
            />
          ) : null}
        </SafeAreaView>
      </Modal>

      <PostModal
        visible={postModalVisible}
        post={selectedPost}
        onClose={() => {
          setPostModalVisible(false);
          setSelectedPost(null);
        }}
        fetchComments={fetchComments}
        addComment={addComment}
        fetchWorkoutDetails={fetchWorkoutDetails}
      />
    </>
  );
}
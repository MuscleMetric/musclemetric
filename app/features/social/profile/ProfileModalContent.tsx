import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "@/lib/supabase";

import { PostModal } from "../feed/modals/PostModal";
import { fetchComments, fetchWorkoutDetails, saveComment } from "../feed/modals/postData";
import { WorkoutPostCard } from "@/app/features/social/feed/posts/WorkoutPostCard";
import { PrPostCard } from "@/app/features/social/feed/posts/PrPostCard";
import type { FeedRow } from "@/app/features/social/feed/types";

import { log } from "@/lib/logger";

type RecentPostPreview = {
  post_id: string;
  user_id: string;
  user_name: string | null;
  user_username: string | null;
  post_type: "workout" | "pr" | "text" | string;
  visibility: "public" | "followers" | "private" | string;
  caption: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  viewer_liked: boolean;
  workout_history_id: string | null;
  exercise_id: string | null;
  exercise_name: string | null;
  workout_snapshot: any;
  pr_snapshot: any;
};

type ProfileCardRow = {
  profile_id: string;
  name: string | null;
  username: string | null;
  visibility: "public" | "followers" | "private" | string;
  can_view: boolean;
  follow_state: "self" | "following" | "requested" | "none" | string;
  workouts_completed: number | null;
  followers_count: number | null;
  following_count: number | null;
  recent_posts: RecentPostPreview[] | null;
};

type ProfileModalContentProps = {
  profileId: string;
  onClose: () => void;
};

function initialsFromName(name?: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    parts[0].slice(0, 1).toUpperCase() +
    parts[parts.length - 1].slice(0, 1).toUpperCase()
  );
}

function fmtTs(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProfileModalContent({
  profileId,
  onClose,
}: ProfileModalContentProps) {
  const [selectedPost, setSelectedPost] = useState<FeedRow | null>(null);
  const { colors, typography, layout } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.bg },
        screen: { flex: 1, backgroundColor: colors.bg },
        header: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.md,
          paddingBottom: layout.space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: layout.space.md,
        },
        headerTitle: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.h2,
          lineHeight: typography.lineHeight.h2,
          flex: 1,
        },
        username: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
          marginBottom: 2,
        },
        closeBtn: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        closeText: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        content: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.lg,
          paddingBottom: layout.space.xxl,
          gap: layout.space.md,
        },

        topCard: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.lg,
          padding: layout.space.lg,
          gap: layout.space.md,
        },

        topRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: layout.space.md,
        },

        identity: {
          flexDirection: "row",
          alignItems: "center",
          gap: layout.space.md,
          flex: 1,
        },

        avatar: {
          width: 56,
          height: 56,
          borderRadius: 999,
          backgroundColor: colors.trackBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.trackBorder,
          alignItems: "center",
          justifyContent: "center",
        },
        avatarText: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: 20,
        },

        nameBlock: { flex: 1 },
        name: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.size.h2,
          lineHeight: typography.lineHeight.h2,
        },
        meta: {
          marginTop: 2,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        followBtn: {
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        followBtnSecondary: {
          backgroundColor: colors.surface,
        },
        followBtnText: {
          color: colors.onPrimary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.sub,
        },
        followBtnTextSecondary: {
          color: colors.text,
        },

        statsRow: {
          flexDirection: "row",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingTop: layout.space.md,
        },
        stat: { flex: 1, alignItems: "center" },
        statValue: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.size.h3,
          lineHeight: typography.lineHeight.h3,
        },
        statLabel: {
          marginTop: 2,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
        },
        divider: {
          width: 1,
          marginVertical: 4,
          backgroundColor: colors.border,
          opacity: 0.9,
        },

        sectionTitle: {
          marginTop: layout.space.sm,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },

        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: layout.space.lg,
        },
        error: {
          color: colors.danger,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.sub,
          textAlign: "center",
        },
        hint: {
          marginTop: 8,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          textAlign: "center",
        },
        privateBox: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.lg,
          padding: layout.space.lg,
        },
        subtleText: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
        },
      }),
    [colors, typography, layout],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [card, setCard] = useState<ProfileCardRow | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;

    setErr(null);
    setLoading(true);

    const res = await supabase
      .rpc("get_profile_overview_v1", { p_profile_id: profileId })
      .single();

    if (res.error) {
      log("get_profile_overview_v1 error:", res.error);
      setErr(res.error.message ?? "Failed to load profile");
      setCard(null);
      setLoading(false);
      return;
    }

    const row = res.data as unknown as ProfileCardRow;
    const normalized: ProfileCardRow = {
      ...row,
      recent_posts: Array.isArray(row?.recent_posts) ? row.recent_posts : [],
    };

    setCard(normalized);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const followActionLabel = useMemo(() => {
    if (!card) return "";
    if (card.follow_state === "self") return "";
    if (card.follow_state === "following") return "Following";
    if (card.follow_state === "requested") return "Requested";
    if (card.visibility === "private") return "Request";
    return "Follow";
  }, [card]);

  const followActionStyle = useMemo(() => {
    if (!card) return [styles.followBtn];
    if (
      card.follow_state === "following" ||
      card.follow_state === "requested"
    ) {
      return [styles.followBtn, styles.followBtnSecondary];
    }
    return [styles.followBtn];
  }, [card, styles]);

  const followActionTextStyle = useMemo(() => {
    if (!card) return [styles.followBtnText];
    if (
      card.follow_state === "following" ||
      card.follow_state === "requested"
    ) {
      return [styles.followBtnText, styles.followBtnTextSecondary];
    }
    return [styles.followBtnText];
  }, [card, styles]);

  const onPressFollow = useCallback(async () => {
    if (!card || acting) return;
    if (card.follow_state === "self") return;

    setActing(true);
    setErr(null);

    try {
      if (card.follow_state === "following") {
        const r = await supabase.rpc("unfollow", { p_target: card.profile_id });
        if (r.error) throw r.error;
      } else if (card.follow_state === "requested") {
        const r = await supabase.rpc("cancel_follow_request", {
          p_target: card.profile_id,
        });
        if (r.error) throw r.error;
      } else {
        const r = await supabase.rpc("request_follow", {
          p_target: card.profile_id,
        });
        if (r.error) throw r.error;
      }

      await load();
    } catch (e: any) {
      log("follow action error:", e);
      setErr(e?.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  }, [card, acting, load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (err || !card) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{err ?? "Profile not found"}</Text>
          <Text style={styles.hint}>Pull to refresh or close and retry.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = initialsFromName(card.name);
  const posts = Array.isArray(card.recent_posts) ? card.recent_posts : [];

  const canSeePosts =
    card.follow_state === "self" ||
    card.follow_state === "following" ||
    card.visibility === "public";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Profile
          </Text>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <FlatList
          data={canSeePosts ? posts : []}
          keyExtractor={(p) => p.post_id}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            <>
              <View style={styles.topCard}>
                <View style={styles.topRow}>
                  <View style={styles.identity}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>

                    <View style={styles.nameBlock}>
                      {card.username ? (
                        <Text style={styles.username} numberOfLines={1}>
                          @{card.username}
                        </Text>
                      ) : null}

                      <Text style={styles.name} numberOfLines={1}>
                        {card.name ?? "User"}
                      </Text>

                      <Text style={styles.meta} numberOfLines={1}>
                        {card.visibility === "public"
                          ? "Public"
                          : card.visibility === "followers"
                            ? "Followers Only"
                            : "Private"}
                        {card.follow_state && card.follow_state !== "self"
                          ? ` • ${card.follow_state}`
                          : ""}
                      </Text>
                    </View>
                  </View>

                  {card.follow_state !== "self" ? (
                    <Pressable
                      onPress={onPressFollow}
                      disabled={acting}
                      style={[
                        ...followActionStyle,
                        { opacity: acting ? 0.7 : 1 },
                      ]}
                    >
                      {acting ? (
                        <ActivityIndicator />
                      ) : (
                        <Text style={followActionTextStyle}>
                          {followActionLabel}
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>

                {canSeePosts ? (
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {card.workouts_completed ?? 0}
                      </Text>
                      <Text style={styles.statLabel}>Workouts</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {card.followers_count ?? 0}
                      </Text>
                      <Text style={styles.statLabel}>Followers</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {card.following_count ?? 0}
                      </Text>
                      <Text style={styles.statLabel}>Following</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.privateBox}>
                    <Text style={styles.meta}>
                      This profile is private. Follow to see stats and posts.
                    </Text>
                  </View>
                )}

                {err ? <Text style={styles.error}>{err}</Text> : null}
              </View>

              {canSeePosts ? (
                <Text style={styles.sectionTitle}>Recent posts</Text>
              ) : null}

              {canSeePosts && posts.length === 0 ? (
                <View style={styles.privateBox}>
                  <Text style={styles.meta}>No posts yet.</Text>
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => {
            const feedItem = item as unknown as FeedRow;

            if (item.post_type === "workout") {
              return (
                <WorkoutPostCard
                  onOpenPost={setSelectedPost}
                  item={feedItem}
                  showHeader={true}
                  showActions={false}
                />
              );
            }

            if (item.post_type === "pr") {
              return (
                <PrPostCard
                  item={feedItem}
                  showHeader={true}
                  showActions={false}
                />
              );
            }

            return (
              <View style={styles.privateBox}>
                <Text style={styles.subtleText}>
                  {item.post_type} • {item.visibility} •{" "}
                  {fmtTs(item.created_at)}
                </Text>

                {!!item.caption ? (
                  <Text style={styles.meta}>{item.caption}</Text>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={<View style={{ height: layout.space.xxl }} />}
        />
        {selectedPost && <PostModal visible post={selectedPost} onClose={() => setSelectedPost(null)}
          fetchComments={fetchComments} fetchWorkoutDetails={fetchWorkoutDetails} addComment={saveComment} />}
      </View>
    </SafeAreaView>
  );
}

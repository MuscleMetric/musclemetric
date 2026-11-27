import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "../../../lib/supabase";
import { useLocalSearchParams, router } from "expo-router";
import CreatePostSheet from "@/app/features/social/create/entry/CreatePostSheet";

import { FeedList } from "./feed/FeedList";
import type { FeedRow } from "./feed/types";

import { PostModal } from "./feed/modals/PostModal";
import { fetchComments, fetchWorkoutDetails, saveComment } from "./feed/modals/postData";

import { log } from "@/lib/logger";

export default function SocialScreen() {
  const { colors, typography, layout } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.bg },

        header: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.lg,
          paddingBottom: layout.space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        },
        title: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.size.h1,
          lineHeight: typography.lineHeight.h1,
        },
        subtitle: {
          marginTop: 6,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          lineHeight: typography.lineHeight.sub,
        },

        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: layout.space.lg,
        },
        errorText: {
          color: colors.danger,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.body,
          textAlign: "center",
        },
        hintText: {
          marginTop: 10,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          textAlign: "center",
        },
      }),
    [colors, typography, layout],
  );

  const PAGE_SIZE = 20;

  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cursorCreatedAt, setCursorCreatedAt] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const didInitialFetch = useRef(false);
  const handledFocusPostIdRef = useRef<string | null>(null);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedRow | null>(null);

  const params = useLocalSearchParams<{
    openCreate?: string;
    focusPostId?: string;
  }>();

  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  useEffect(() => {
    if (params.openCreate === "1") {
      setCreateSheetOpen(true);
      router.setParams({ openCreate: undefined });
    }
  }, [params.openCreate]);

  const openComments = useCallback((post: FeedRow) => {
    log("openComments called", {
      postId: post.post_id,
      commentCount: post.comment_count,
    });
    setSelectedPost(post);
    setPostModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setPostModalOpen(false);
    setSelectedPost(null);
  }, []);

  const bumpCommentCount = useCallback((postId: string, delta: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.post_id !== postId
          ? r
          : {
              ...r,
              comment_count: Math.max(0, (r.comment_count ?? 0) + delta),
            },
      ),
    );

    setSelectedPost((prev) =>
      !prev || prev.post_id !== postId
        ? prev
        : {
            ...prev,
            comment_count: Math.max(0, (prev.comment_count ?? 0) + delta),
          },
    );
  }, []);

  const addComment = useCallback(
    async (postId: string, body: string) => {
      await saveComment(postId, body);

      bumpCommentCount(postId, +1);
    },
    [bumpCommentCount],
  );

  const applyCursorFrom = useCallback(
    (
      data: FeedRow[],
      fallbackCreatedAt: string | null,
      fallbackId: string | null,
    ) => {
      const last = data[data.length - 1];
      setCursorCreatedAt(last?.created_at ?? fallbackCreatedAt);
      setCursorId(last?.post_id ?? fallbackId);
    },
    [],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await supabase.rpc("get_feed", { p_limit: PAGE_SIZE });

      if (res.error) {
        log("get_feed error:", res.error);
        setErrorMsg(res.error.message ?? "Failed to load feed");
        setRows([]);
        setCursorCreatedAt(null);
        setCursorId(null);
        return;
      }

      const data = (res.data ?? []) as FeedRow[];
      setRows(data);
      applyCursorFrom(data, null, null);
    } catch (e: any) {
      log("get_feed exception:", e);
      setErrorMsg(e?.message ?? "Failed to load feed");
      setRows([]);
      setCursorCreatedAt(null);
      setCursorId(null);
    } finally {
      setLoading(false);
    }
  }, [applyCursorFrom]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    if (!cursorCreatedAt || !cursorId) return;

    setLoadingMore(true);
    setErrorMsg(null);

    try {
      const res = await supabase.rpc("get_feed", {
        p_limit: PAGE_SIZE,
        p_cursor_created_at: cursorCreatedAt,
        p_cursor_id: cursorId,
      });

      if (res.error) {
        log("get_feed more error:", res.error);
        setErrorMsg(res.error.message ?? "Failed to load more");
        return;
      }

      const data = (res.data ?? []) as FeedRow[];
      if (!data.length) return;

      setRows((prev) => {
        const existing = new Set(prev.map((r) => r.post_id));
        const next = data.filter((r) => !existing.has(r.post_id));
        return [...prev, ...next];
      });

      applyCursorFrom(data, cursorCreatedAt, cursorId);
    } catch (e: any) {
      log("get_feed more exception:", e);
      setErrorMsg(e?.message ?? "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [cursorCreatedAt, cursorId, loadingMore, applyCursorFrom]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  }, [loadInitial]);

  useEffect(() => {
    if (didInitialFetch.current) return;
    didInitialFetch.current = true;
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const focusPostId =
      typeof params.focusPostId === "string" ? params.focusPostId : undefined;

    if (!focusPostId) {
      handledFocusPostIdRef.current = null;
      return;
    }

    if (loading) return;

    if (handledFocusPostIdRef.current === focusPostId) return;

    const targetPost = rows.find((row) => row.post_id === focusPostId);
    if (!targetPost) return;

    handledFocusPostIdRef.current = focusPostId;
    setSelectedPost(targetPost);
    setPostModalOpen(true);

    router.setParams({ focusPostId: undefined });
  }, [params.focusPostId, rows, loading]);

  const toggleLike = useCallback(
    async (postId: string) => {
      const currentRow = rows.find((r) => r.post_id === postId);
      if (!currentRow) return;

      const prevLiked = currentRow.viewer_liked;
      const prevCount = currentRow.like_count;

      const nextLiked = !prevLiked;
      const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

      setRows((prev) =>
        prev.map((r) =>
          r.post_id !== postId
            ? r
            : {
                ...r,
                viewer_liked: nextLiked,
                like_count: nextCount,
              },
        ),
      );

      const res = await supabase.rpc("toggle_post_like", { p_post_id: postId });
      log("toggle_post_like result", res.data, res.error);

      if (res.error) {
        log("toggle_post_like error:", res.error);

        setRows((prev) =>
          prev.map((r) =>
            r.post_id !== postId
              ? r
              : {
                  ...r,
                  viewer_liked: prevLiked,
                  like_count: prevCount,
                },
          ),
        );
        return;
      }

      const row = (res.data?.[0] ?? null) as {
        liked: boolean;
        like_count: number;
      } | null;

      if (!row) {
        setRows((prev) =>
          prev.map((r) =>
            r.post_id !== postId
              ? r
              : {
                  ...r,
                  viewer_liked: prevLiked,
                  like_count: prevCount,
                },
          ),
        );
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.post_id !== postId
            ? r
            : {
                ...r,
                viewer_liked: row.liked,
                like_count: row.like_count,
              },
        ),
      );

      setSelectedPost((prev) =>
        !prev || prev.post_id !== postId
          ? prev
          : {
              ...prev,
              viewer_liked: row.liked,
              like_count: row.like_count,
            },
      );
    },
    [rows],
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Text style={styles.hintText}>Pull to refresh.</Text>
        </View>

        <View style={{ flex: 1 }}>
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FeedList
        rows={rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        loadingMore={loadingMore}
        onEndReached={() => {
          if (rows.length >= PAGE_SIZE) loadMore();
        }}
        onToggleLike={toggleLike}
        onOpenComments={openComments}
      />

      <PostModal
        visible={postModalOpen}
        post={selectedPost}
        onClose={closeModal}
        fetchComments={fetchComments}
        addComment={addComment}
        fetchWorkoutDetails={fetchWorkoutDetails}
      />

      <CreatePostSheet
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onChoose={(type) => {
          setCreateSheetOpen(false);

          router.push({
            pathname: "/features/social/create",
            params: { type },
          });
        }}
      />
    </View>
  );
}

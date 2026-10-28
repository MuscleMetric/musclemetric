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
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "@/lib/supabase";
import { ChevronLeft } from "lucide-react-native";

import { log } from "@/lib/logger";

type FollowState =
  | "self"
  | "following"
  | "requested"
  | "none"
  | "blocked"
  | string;

type SearchRow = {
  user_id: string;
  name: string | null;
  username: string | null;
  follow_state: FollowState;
};

type RequestedRow = {
  user_id: string;
  name: string | null;
  username: string | null;
  follow_state: "requested";
};

function initialsFromName(name?: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (
    parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)
  ).toUpperCase();
}

function labelForFollowState(s: FollowState) {
  switch (s) {
    case "self":
      return "You";
    case "following":
      return "Following";
    case "requested":
      return "Requested";
    case "none":
      return "Follow";
    case "blocked":
      return "Blocked";
    default:
      return String(s);
  }
}

export default function SearchScreen() {
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
          gap: layout.space.md,
        },

        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        title: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.size.h2,
          lineHeight: typography.lineHeight.h2,
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

        tabsRow: { flexDirection: "row", gap: 10 },
        tab: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: "center",
        },
        tabOn: {
          backgroundColor: colors.cardPressed,
          borderColor: colors.primary,
        },
        tabTxt: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        input: {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 12,
          color: colors.text,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.body,
        },

        listContent: {
          paddingHorizontal: layout.space.lg,
          paddingTop: layout.space.md,
          paddingBottom: layout.space.xxl,
        },

        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: layout.space.md,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },

        left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },

        avatar: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.trackBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.trackBorder,
          alignItems: "center",
          justifyContent: "center",
        },
        avatarTxt: {
          color: colors.text,
          fontFamily: typography.fontFamily.bold,
          fontSize: 16,
        },

        nameCol: { flex: 1 },
        name: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.body,
          lineHeight: typography.lineHeight.body,
        },
        sub: {
          marginTop: 2,
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.meta,
          lineHeight: typography.lineHeight.meta,
        },

        right: { alignItems: "flex-end" },
        followBtn: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        followBtnOn: {
          borderColor: colors.primary,
          backgroundColor: colors.cardPressed,
        },
        followBtnDanger: {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: 0.9,
        },
        followTxt: {
          color: colors.text,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.size.meta,
        },

        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: layout.space.lg,
        },
        empty: {
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.size.sub,
          textAlign: "center",
        },
        err: {
          color: colors.danger,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.size.sub,
          textAlign: "center",
        },
      }),
    [colors, typography, layout],
  );

  const [mode, setMode] = useState<"search" | "requested">("search");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<SearchRow[]>([]);
  const [requested, setRequested] = useState<RequestedRow[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    setLoading(true);
    setErr(null);

    try {
      const res = await supabase.rpc("search_users_v1", {
        q: query,
        p_limit: 25,
      });

      if (res.error) {
        log("search_users_v1 error:", res.error);
        setRows([]);
        setErr(res.error.message ?? "Search failed");
      } else {
        const data = (res.data ?? []) as any[];
        // only keep what we display for now
        const slim: SearchRow[] = data.map((r) => ({
          user_id: String(r.user_id),
          name: r.name ?? null,
          username: r.username ?? null,
          follow_state: r.follow_state ?? "none",
        }));
        setRows(slim);
      }
    } catch (e: any) {
      log("search_users_v1 exception:", e);
      setRows([]);
      setErr(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequested = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;

      if (!uid) {
        setRequested([]);
        setErr("Not authenticated");
        setLoading(false);
        return;
      }

      // 1) get my pending outgoing requests
      const fr = await supabase
        .from("follow_requests")
        .select("target_id, status, created_at")
        .eq("requester_id", uid)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);

      if (fr.error) {
        log("follow_requests read error:", fr.error);
        setRequested([]);
        setErr(fr.error.message ?? "Failed to load requested");
        setLoading(false);
        return;
      }

      const ids = (fr.data ?? []).map((r: any) => r.target_id).filter(Boolean);
      if (!ids.length) {
        setRequested([]);
        setLoading(false);
        return;
      }

      // 2) fetch profiles for those ids (RLS will restrict as needed)
      const pr = await supabase
        .rpc("get_social_identities_v1", { p_user_ids: ids });

      if (pr.error) {
        log("profiles read error:", pr.error);
        // still show ids at least
        setRequested(
          ids.map((id: string) => ({
            user_id: id,
            name: byId.get(id)?.name ?? null,
            username: byId.get(id)?.username ?? null,
            follow_state: "requested",
          })),
        );
        setLoading(false);
        return;
      }

      const byId = new Map<string, any>(
        (pr.data ?? []).map((p: any) => [p.id, p]),
      );
      setRequested(
        ids.map((id: string) => ({
          user_id: id,
          name: byId.get(id)?.name ?? null,
          username: null,
          follow_state: "requested",
        })),
      );
    } catch (e: any) {
      log("loadRequested exception:", e);
      setRequested([]);
      setErr(e?.message ?? "Failed to load requested");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search when in search mode
  useEffect(() => {
    if (mode !== "search") return;

    if (debounceRef.current) clearTimeout(debounceRef.current as any);

    debounceRef.current = setTimeout(() => {
      runSearch(q.trim());
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current as any);
    };
  }, [q, mode, runSearch]);

  // When switching modes, load requested
  useEffect(() => {
    if (mode === "requested") loadRequested();
  }, [mode, loadRequested]);

  const openProfile = (userId: string) => {
    // We’ll make this route a modal next.
    router.push(`/features/social/profile/${userId}`);
  };

  const onFollowPress = async (item: SearchRow | RequestedRow) => {
    const state = item.follow_state;

    if (state === "self" || state === "blocked") return;

    // Optimistic update helper
    const updateInLists = (userId: string, nextState: FollowState) => {
      setRows((prev) =>
        prev.map((r) =>
          r.user_id === userId ? { ...r, follow_state: nextState } : r,
        ),
      );
      setRequested(
        (prev) =>
          nextState === "requested"
            ? prev
            : prev.filter((r) => r.user_id !== userId), // remove from requested tab if cancelled/changed
      );
    };

    try {
      if (state === "none") {
        updateInLists(item.user_id, "requested");
        const res = await supabase.rpc("request_follow", {
          p_target: item.user_id,
        });
        if (res.error) throw res.error;
        // res.data is 'following' or 'requested'
        updateInLists(
          item.user_id,
          String(res.data ?? "requested") as FollowState,
        );
        return;
      }

      if (state === "requested") {
        updateInLists(item.user_id, "none");
        const res = await supabase.rpc("cancel_follow_request", {
          p_target: item.user_id,
        });
        if (res.error) throw res.error;
        return;
      }

      if (state === "following") {
        updateInLists(item.user_id, "none");
        const res = await supabase.rpc("unfollow", { p_target: item.user_id });
        if (res.error) throw res.error;
        return;
      }
    } catch (e: any) {
      log("follow action error:", e);
      setErr(e?.message ?? "Action failed");
      // fallback refresh current mode
      if (mode === "requested") loadRequested();
      else runSearch(q.trim());
    }
  };

  const data = mode === "search" ? rows : requested;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={["top", "left", "right"]}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
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

            <Text style={styles.title}>Search</Text>

            {/* spacer to keep title centered */}
            <View style={{ width: 36, height: 36 }} />
          </View>

          <View style={styles.tabsRow}>
            <Pressable
              onPress={() => setMode("search")}
              style={[styles.tab, mode === "search" && styles.tabOn]}
            >
              <Text style={styles.tabTxt}>Search</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("requested")}
              style={[styles.tab, mode === "requested" && styles.tabOn]}
            >
              <Text style={styles.tabTxt}>Requested</Text>
            </Pressable>
          </View>

          {mode === "search" ? (
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search by username…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
            />
          ) : null}

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={data}
            keyExtractor={(i) => i.user_id}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {mode === "search"
                  ? q.trim()
                    ? "No users found."
                    : "Search for people by username."
                  : "No pending requests."}
              </Text>
            }
            renderItem={({ item }) => {
              const initials = initialsFromName(item.name);
              const label = labelForFollowState(item.follow_state);
              const isPrimary = item.follow_state === "none";
              const isDisabled =
                item.follow_state === "self" || item.follow_state === "blocked";

              return (
                <Pressable
                  onPress={() => openProfile(item.user_id)}
                  style={styles.row}
                >
                  <View style={styles.left}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{initials}</Text>
                    </View>

                    <View style={styles.nameCol}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name ?? "User"}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {item.username ? `@${item.username}` : "—"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.right}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onFollowPress(item);
                      }}
                      disabled={isDisabled}
                      style={[
                        styles.followBtn,
                        isPrimary && styles.followBtnOn,
                        isDisabled && styles.followBtnDanger,
                      ]}
                    >
                      <Text style={styles.followTxt}>{label}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

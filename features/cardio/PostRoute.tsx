import React, { useCallback, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui";
import type { RunType } from "@/app/features/cardio/tracking/types";
import { RecordedWorkoutDetail } from "./GpsWorkoutDetail";
import RouteMap from "./RouteMap";

type PostRoute = {
  owner: boolean; shared: boolean; type: RunType | null; completed: string; meters: number;
  active: number; elapsed: number; effort: number | null;
  frame: { lat: number; lon: number; latStep: number; lonStep: number } | null;
  drawing: [number, number][][] | null;
  splits: { distance: number; seconds: number; partial: boolean }[];
};

export function usePostRoutes(postId: string | null, detail = false) {
  const { session } = useAuth();
  const user = session?.user.id;
  const key = user && postId ? user + "/" + postId : null;
  const [state, setState] = useState<{ key: string; routes: PostRoute[] } | null>(null);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!key || !postId) return;
    let active = true;
    async function load() {
      const { data, error } = await supabase.rpc("get_post_routes_v1", { p_post_id: postId, p_detail: detail });
      if (active && key) setState({ key, routes: !error && Array.isArray(data) ? data : [] });
    }
    void load().catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [key, postId, detail, revision]));
  return { routes: key && state?.key === key ? state.routes : [], reload: () => setRevision(n => n + 1) };
}

export function PostMap({ route, preview = false }: { route: PostRoute; preview?: boolean }) {
  const { colors } = useAppTheme();
  const { drawing, frame } = route;
  if (!drawing?.length || !frame) return null;
  if (Platform.OS === "ios") {
    const points = drawing.flatMap((line, leg) => line.map(([x,y]) => ({
      latitude: frame.lat - (y - 90) * frame.latStep,
      longitude: ((frame.lon + (x - 160) * frame.lonStep + 540) % 360) - 180, leg,
    })));
    return <View pointerEvents={preview ? "none" : "auto"}><RouteMap points={points} /></View>;
  }
  return <Svg width="100%" height={190} viewBox="0 0 320 180" accessibilityLabel="Recorded workout route"
    style={{ backgroundColor: colors.bg }}>
    {drawing.map((line,i) => <Path key={i} d={line.map(([x,y],j) => (j ? "L" : "M") + x + " " + y).join(" ")}
      fill="none" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
  </Svg>;
}

export function PostRouteDetails({ postId, audience, name, mixed, fallback }: {
  postId: string; audience: string; name: string; mixed: boolean; fallback: React.ReactNode;
}) {
  const { routes, reload } = usePostRoutes(postId, true);
  const { colors } = useAppTheme();
  const [saving, setSaving] = useState(false);
  const first = routes[0];
  async function setShared(share: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_post_route_share_v1", { p_post_id: postId, p_share: share });
      if (error) throw error;
      reload();
    } catch { Alert.alert("Route sharing could not be updated", "Please try again."); }
    finally { setSaving(false); }
  }
  if (!first) return <>{fallback}</>;
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Workout details</Text>
    {routes.map((route,i) => <RecordedWorkoutDetail key={i} name={name} type={route.type}
      completed={Date.parse(route.completed)} km={route.meters/1000} active={route.active}
      elapsed={route.elapsed} effort={route.effort} rows={route.splits}
      map={route.drawing?.length ? <PostMap route={route} /> : null} />)}
    {first.owner && <Button variant="outline" disabled={saving}
      title={first.shared ? "Hide route from post" : "Share route on this post"}
      onPress={() => first.shared ? void setShared(false) : Alert.alert("Share this route?",
        "People who can see this " + audience + " post will see the route location and kilometre splits.",
        [{ text: "Cancel", style: "cancel" }, { text: "Share route", onPress: () => void setShared(true) }])} />}
    {mixed && fallback}
  </View>;
}

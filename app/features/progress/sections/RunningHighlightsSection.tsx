import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { ProgressSection } from "../components/ProgressSection";
import { cardioTime } from "../deep-analytics/utils/cardioFormat";
import { loadAnalyticsRuns, type AnalyticsRun } from "@/features/cardio/analyticsData";
import { measuredBest } from "@/features/cardio/analyticsMetrics";
import { benchmarks } from "@/features/cardio/runMetrics";
import { listRuns } from "@/features/cardio/runStore";

const names: Record<number, string> = {
  1000: "1 km", 5000: "5 km", 10000: "10 km",
  21097.5: "Half marathon", 42195: "Marathon",
};

export default function RunningHighlightsSection() {
  const { session } = useAuth();
  const { colors } = useAppTheme();
  const owner = session?.user?.id;
  const [runs, setRuns] = useState<AnalyticsRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!owner) { setRuns([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    void listRuns(owner).then(device => loadAnalyticsRuns(owner, device)).then(all => {
      if (!active) return;
      setRuns(all);
      setError(false);
    }).catch(() => { if (active) setError(true); }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [owner]);

  const highlights = useMemo(() => benchmarks.map(distance => {
    const candidates = runs.flatMap(run => {
      const result = measuredBest(run, distance);
      return result === null ? [] : [{ run, seconds: result }];
    });
    const best = candidates.sort((a, b) => a.seconds - b.seconds)[0];
    return { distance, best };
  }), [runs]);

  const openRun = (run: AnalyticsRun) => {
    if (run.historyId) {
      router.push({ pathname: "/features/progress/screens/historyDetail",
        params: { workoutHistoryId: run.historyId } });
    } else {
      router.push({ pathname: "/features/cardio/outdoor-run", params: { view: "progress" } });
    }
  };

  return <ProgressSection>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <View>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>Running highlights</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 13 }}>Your best measured times</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() =>
        router.push({ pathname: "/features/cardio/outdoor-run", params: { view: "progress" } })}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>View all ›</Text>
      </Pressable>
    </View>
    {loading ? <Text style={{ color: colors.textMuted }}>Loading running records…</Text> : null}
    {error ? <Text style={{ color: colors.textMuted }}>Could not load running records. Open Running progress to retry.</Text> : null}
    {!loading && !error && <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
      {highlights.map(({ distance, best }) =>
        <Pressable key={distance} accessibilityRole="button" disabled={!best}
          accessibilityLabel={names[distance] + (best ? " personal best " + cardioTime(best.seconds) : " no result yet")}
          onPress={() => best && openRun(best.run)}
          style={{ width: 190, backgroundColor: colors.surface, borderRadius: 22, padding: 16,
            borderWidth: 1, borderColor: colors.border, gap: 8 }}>
          <Text style={{ fontWeight: "900", color: colors.text, fontSize: 16 }}>{names[distance]}</Text>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 32 }}>
            {best ? cardioTime(best.seconds) : "—"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {best ? new Date(best.run.start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
              : "No completed result"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {best ? (best.run.sourceLabel === "logged" ? "Logged result" : "GPS result") + " · Open workout ›" : "Keep logging runs"}
          </Text>
        </Pressable>)}
    </ScrollView>}
  </ProgressSection>;
}

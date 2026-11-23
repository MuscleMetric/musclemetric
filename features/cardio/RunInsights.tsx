import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { Button } from "@/ui";
import { useAppTheme } from "@/lib/useAppTheme";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "@/app/features/cardio/tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { benchmarks, meters, type Run } from "./runMetrics";
import { measuredBest, runGraphData } from "./analyticsMetrics";
import { loadAnalyticsRuns, type AnalyticsRun } from "./analyticsData";

type Metric = "distance" | "duration" | "pace";
const LABELS: Record<Metric, string> = { distance: "Distance", duration: "Time", pace: "Avg pace" };
const LABEL_DISTANCE: Record<number, string> = {
  1000: "1 km", 5000: "5 km", 10000: "10 km", 21097.5: "Half marathon", 42195: "Marathon",
};
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const positive = (n: number) => Number.isFinite(n) && n > 0;
const distanceKm = (run: Run) => meters(run) / 1000;
const seconds = (run: Run) => run.accumulatedMs / 1000;
const pace = (run: Run) => seconds(run) / distanceKm(run);
const metricValue = (run: Run, metric: Metric) =>
  metric === "distance" ? distanceKm(run) : metric === "duration" ? seconds(run) / 60 : pace(run);
const metricDisplay = (run: Run, metric: Metric) =>
  metric === "distance" ? distanceKm(run).toFixed(2) + " km"
    : metric === "duration" ? cardioTime(seconds(run)) : cardioPace(pace(run));

function RunTrendChart({
  runs, metric, selectedId, onSelect,
}: { runs: AnalyticsRun[]; metric: Metric; selectedId: string | null; onSelect: (id: string) => void }) {
  const { colors } = useAppTheme();
  if (!runs.length) {
    return <Text style={{ color: colors.textMuted, paddingVertical: 16 }}>No completed runs of this type in the past 90 days.</Text>;
  }
  const width = Math.max(320, runs.length * 44 + 32);
  const height = 152;
  const top = 16, bottom = 128;
  const values = runs.map(run => metricValue(run, metric));
  const min = Math.min(...values), max = Math.max(...values);
  const spread = Math.max(max - min, 0.01);
  const points = values.map((value, index) => ({
    x: 16 + (index * (width - 32)) / Math.max(1, runs.length - 1),
    y: top + (metric === "pace" ? (value - min) / spread : (max - value) / spread) * (bottom - top),
  }));
  const path = points.map((p, i) => (i ? "L " : "M ") + p.x + " " + p.y).join(" ");
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Run progress chart">
      <View style={{ width }}>
        <Svg width={width} height={height}>
          {[top, (top + bottom) / 2, bottom].map(y =>
            <Line key={y} x1={0} y1={y} x2={width} y2={y} stroke={colors.border} strokeDasharray="4 5" />)}
          <Path d={path} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" />
          {points.map((p, i) =>
            <Circle key={runs[i].id} cx={p.x} cy={p.y} r={selectedId === runs[i].id ? 7 : 5}
              fill={selectedId === runs[i].id ? colors.success : colors.primary}
              onPress={() => onSelect(runs[i].id)} />)}
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{shortDate(runs[0].start)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{shortDate(runs[runs.length - 1].start)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export function RunInsights({ runs, owner, open }: {
  runs: Run[]; owner: string; open: (id: string, historyId?: string | null) => void;
}) {
  const { colors } = useAppTheme();
  const [allRuns, setAllRuns] = useState<AnalyticsRun[]>(runs);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<RunType | null>(null);
  const [metric, setMetric] = useState<Metric>("pace");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAllRuns(runs);
    void loadAnalyticsRuns(owner, runs).then(result => {
      if (active) { setAllRuns(result); setLoadError(false); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [owner, runs]);

  const trend = useMemo(() => runGraphData(allRuns, type), [allRuns, type]);
  const selected = trend.find(run => run.id === selectedId) ?? trend[trend.length - 1];
  const records = useMemo(() => benchmarks.map(distance => {
    const candidates = allRuns.flatMap(run => {
      const result = measuredBest(run, distance);
      return result === null ? [] : [{ run, time: result }];
    });
    return { distance, best: candidates.sort((a, b) => a.time - b.time)[0] };
  }), [allRuns]);
  const latest = trend[trend.length - 1];

  const heading = { color: colors.text, fontWeight: "800" as const, fontSize: 18 };
  const panel = { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 } as const;

  return <View style={{ gap: 16 }}>
    <View style={panel}>
      <Text style={heading}>Running personal bests</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>GPS-measured segments and matching completed sessions · all time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {records.map(({ distance, best }) =>
          <Pressable key={distance} onPress={() => best && open(best.run.id, best.run.historyId)}
            accessibilityRole="button" disabled={!best}
            style={{ padding: 13, borderRadius: 14, backgroundColor: colors.trackBg, minWidth: 128, gap: 5 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{LABEL_DISTANCE[distance]}</Text>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{best ? cardioTime(best.time) : "—"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{best ? shortDate(best.run.start) + " · " + (best.run.sourceLabel === "logged" ? "Logged" : "GPS") : "No recorded result"}</Text>
          </Pressable>)}
      </ScrollView>
    </View>

    <View style={panel}>
      <Text style={heading}>Progress by run type</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Every completed run · rolling 90 days</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[null, ...RUN_TYPES].map(t =>
          <Button key={t ?? "all"} title={t ? RUN_TYPE_LABELS[t] : "All"}
            fullWidth={false} variant={type === t ? "primary" : "outline"}
            onPress={() => { setType(t); setSelectedId(null); }} />)}
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {(["distance", "duration", "pace"] as Metric[]).map(option =>
          <Button key={option} title={LABELS[option]} fullWidth={false}
            variant={metric === option ? "primary" : "outline"} onPress={() => setMetric(option)} />)}
      </View>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 23 }}>
        {latest ? metricDisplay(latest, metric) : "—"}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Latest run · {metric === "pace" ? "lower min/km is faster" : LABELS[metric].toLowerCase()}</Text>
      <RunTrendChart runs={trend} metric={metric} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      {selected && <Pressable onPress={() => open(selected.id, selected.historyId)} accessibilityRole="button"
        style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>{shortDate(selected.start)} · {selected.type ? RUN_TYPE_LABELS[selected.type] : "Uncategorised run"}</Text>
        <Text style={{ color: colors.textMuted, marginTop: 3 }}>
          {distanceKm(selected).toFixed(2)} km · {cardioTime(seconds(selected))} · {cardioPace(pace(selected))}
        </Text>
        <Text style={{ color: colors.primary, marginTop: 6 }}>View workout details ›</Text>
      </Pressable>}
      {loadError && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Saved history could not be loaded. Showing runs available on this iPhone.</Text>}
    </View>
  </View>;
}

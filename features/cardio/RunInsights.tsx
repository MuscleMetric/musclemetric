import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { Button } from "@/ui";
import { useAppTheme } from "@/lib/useAppTheme";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "@/app/features/cardio/tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { benchmarks, meters, type Run } from "./runMetrics";
import { DAY_MS, measuredBest, runGraphData } from "./analyticsMetrics";
import { loadAnalyticsRuns, type AnalyticsRun } from "./analyticsData";

type OpenRun = (id: string, historyId?: string | null) => void;
type Metric = "distance" | "duration" | "pace";
const LABELS: Record<Metric, string> = { distance: "Distance", duration: "Time", pace: "Avg pace" };
const LABEL_DISTANCE: Record<number, string> = {
  1000: "1 km", 5000: "5 km", 10000: "10 km", 21097.5: "Half marathon", 42195: "Marathon",
};
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const distanceKm = (run: Run) => meters(run) / 1000;
const seconds = (run: Run) => run.accumulatedMs / 1000;
const pace = (run: Run) => seconds(run) / distanceKm(run);
const metricValue = (run: Run, metric: Metric) =>
  metric === "distance" ? distanceKm(run) : metric === "duration" ? seconds(run) / 60 : pace(run);
const metricDisplay = (run: Run, metric: Metric) =>
  metric === "distance" ? distanceKm(run).toFixed(2) + " km"
    : metric === "duration" ? cardioTime(seconds(run)) : cardioPace(pace(run));

function RunTrendChart({
  runs, metric, open,
}: { runs: AnalyticsRun[]; metric: Metric; open: OpenRun }) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  if (!runs.length) {
    return <Text style={{ color: colors.textMuted, paddingVertical: 16 }}>No completed runs of this type in the past 90 days.</Text>;
  }
  const now = Date.now();
  const left = 48, right = Math.max(left + 1, width - 10);
  const top = 14, bottom = 214;
  const values = runs.map(run => metricValue(run, metric));
  const low = Math.min(...values), high = Math.max(...values);
  const precision = metric === "distance" ? 0.01 : metric === "duration" ? 0.1 : 1;
  const roughStep = Math.max((high - low) / 4, precision);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(n => n * magnitude >= roughStep) ?? 10) * magnitude;
  const first = Math.max(0, Math.floor(low / step) - (low === high ? 1 : 0)) * step;
  const count = Math.max(2, Math.ceil((high - first) / step));
  const last = first + count * step;
  const y = (value: number) => top + (bottom - top) *
    (metric === "pace" ? value - first : last - value) / (last - first);
  const windowStart = now - 90 * DAY_MS;
  const x = (date: number) => left + (right - left) * Math.min(1, Math.max(0, (date - windowStart) / (now - windowStart)));
  const tickLabel = (value: number) => metric === "pace" ? cardioTime(value) : String(Number(value.toFixed(2)));
  const path = runs.map((run, i) => (i ? "L " : "M ") + x(run.start) + " " + y(values[i])).join(" ");
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text style={{ color: colors.textMuted }}>{metric === "pace" ? "Average pace (min/km) · faster at the top" :
      metric === "duration" ? "Active time (minutes)" : "Distance (km)"}</Text>
    {width > 0 && <Svg width={width} height={246} accessibilityLabel="Run trend over the last 90 days">
      {Array.from({ length: count + 1 }, (_, i) => {
        const value = first + i * step;
        return <React.Fragment key={i}>
          <Line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={colors.border} strokeDasharray="4 5" />
          <SvgText x={left - 6} y={y(value) + 4} textAnchor="end" fontSize={11} fill={colors.textMuted}>{tickLabel(value)}</SvgText>
        </React.Fragment>;
      })}
      <Path d={path} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" />
      {runs.map((run, i) => <Circle key={run.id} cx={x(run.start)} cy={y(values[i])}
        r={4} fill={colors.primary}
        onPress={() => open(run.id, run.historyId)} />)}
      {[90, 45, 0].map(days => <SvgText key={days} x={x(now - days * DAY_MS)} y={237}
        textAnchor={days === 90 ? "start" : days === 0 ? "end" : "middle"}
        fontSize={11} fill={colors.textMuted}>{days === 0 ? "Today" : shortDate(now - days * DAY_MS)}</SvgText>)}
    </Svg>}
  </View>;
}

const visibleRunCount = 5;
const minRowHeight = 82;

function RunList({ runs, open }: { runs: AnalyticsRun[]; open: OpenRun }) {
  const { colors } = useAppTheme();
  const [height, setHeight] = useState(visibleRunCount * minRowHeight);
  const scrollable = runs.length > visibleRunCount;
  return <ScrollView nestedScrollEnabled scrollEnabled={scrollable}
    style={scrollable ? { maxHeight: height } : undefined}>
    {runs.map((run, index) =>
      <Pressable key={run.id} accessibilityRole="button" onPress={() => open(run.id, run.historyId)}
        onLayout={scrollable && index === visibleRunCount - 1 ? event => {
          const row = event.nativeEvent.layout;
          setHeight(row.y + row.height);
        } : undefined}
        style={{ minHeight: minRowHeight, justifyContent: "center", paddingVertical: 8,
          borderTopWidth: 1, borderColor: colors.border, gap: 3 }}>
        <Text style={{ color: colors.text, fontWeight: "700" }}>
          {shortDate(run.start)} · {run.type ? RUN_TYPE_LABELS[run.type] : "Uncategorised run"}
        </Text>
        <Text style={{ color: colors.textMuted }}>
          {distanceKm(run).toFixed(2)} km · {cardioTime(seconds(run))} · {cardioPace(pace(run))}
        </Text>
        <Text style={{ color: colors.primary }}>View workout details ›</Text>
      </Pressable>)}
  </ScrollView>;
}

export function RunInsights({ runs, owner, open }: {
  runs: Run[]; owner: string; open: OpenRun;
}) {
  const { colors } = useAppTheme();
  const [allRuns, setAllRuns] = useState<AnalyticsRun[]>(runs);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<RunType | null>(null);
  const [metric, setMetric] = useState<Metric>("pace");

  useEffect(() => {
    let active = true;
    setAllRuns(runs);
    void loadAnalyticsRuns(owner, runs).then(result => {
      if (active) { setAllRuns(result); setLoadError(false); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [owner, runs]);

  const recent = useMemo(() => runGraphData(allRuns, null), [allRuns]);
  const usedTypes = RUN_TYPES.filter(option => recent.some(run => run.type === option));
  const activeType = type && usedTypes.includes(type) ? type : null;
  const trend = activeType ? recent.filter(run => run.type === activeType) : recent;
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
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, color: colors.textMuted }}>Distance</Text>
        <Text style={{ flex: 1, textAlign: "center", color: colors.textMuted }}>Completed</Text>
        <Text style={{ flex: 1, textAlign: "right", color: colors.textMuted }}>Time</Text>
      </View>
      <View>
        {records.map(({ distance, best }) =>
          <Pressable key={distance} disabled={!best} accessibilityRole={best ? "button" : undefined}
            onPress={() => best && open(best.run.id, best.run.historyId)}
            style={{ minHeight: 48, flexDirection: "row", alignItems: "center", paddingVertical: 6,
              borderTopWidth: 1, borderColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{LABEL_DISTANCE[distance]}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {best ? (best.run.sourceLabel === "logged" ? "Logged" : "GPS") : "No result yet"}
              </Text>
            </View>
            <Text style={{ flex: 1, textAlign: "center", color: colors.textMuted }}>
              {best ? new Date(best.run.end ?? best.run.start).toLocaleDateString("en-GB",
                { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </Text>
            <Text style={{ flex: 1, textAlign: "right", color: colors.text, fontWeight: "800",
              fontVariant: ["tabular-nums"] }}>{best ? cardioTime(best.time) : "—"}</Text>
          </Pressable>)}
      </View>
    </View>

    <View style={panel}>
      <Text style={heading}>Progress by run type</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Every completed run · rolling 90 days</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[null, ...usedTypes].map(option => {
          const active = activeType === option;
          return <Pressable key={option ?? "all"} onPress={() => setType(option)} accessibilityRole="button"
            accessibilityState={{ selected: active }} style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}>
            <Text style={{ textAlign: "center", fontSize: 13, fontWeight: "600", paddingHorizontal: 9,
              paddingVertical: 5, borderWidth: 1, borderRadius: 12, overflow: "hidden",
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primary : colors.surface,
              color: active ? "#fff" : colors.text }}>{option ? RUN_TYPE_LABELS[option] : "All"}</Text>
          </Pressable>;
        })}
      </View>
      <RunTrendChart runs={trend} metric={metric} open={open} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {(["distance", "duration", "pace"] as Metric[]).map(option =>
          <Button key={option} title={LABELS[option]} fullWidth={false}
            variant={metric === option ? "primary" : "outline"} onPress={() => setMetric(option)} />)}
      </View>
      <Text style={{ color: colors.text, textAlign: "center", fontWeight: "800", fontSize: 23 }}>
        {latest ? metricDisplay(latest, metric) : "—"}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>Latest run · {metric === "pace" ? "lower min/km is faster" : LABELS[metric].toLowerCase()}</Text>

      {trend.length > 0 && <RunList key={activeType ?? "all"} runs={trend.slice().reverse()} open={open} />}
      {loadError && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Saved history could not be loaded. Showing runs available on this iPhone.</Text>}
    </View>
  </View>;
}

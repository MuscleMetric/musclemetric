import React from "react";
import { Text, View } from "react-native";
import { useAppTheme } from "@/lib/useAppTheme";
import { Card } from "@/ui";
import { WorkoutDetailCard } from "./WorkoutDetailCard";
import { RUN_TYPE_LABELS } from "@/app/features/cardio/tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { meters, routeExpired, splits, type Run } from "./runMetrics";
import RouteMap from "./RouteMap";

export function GpsWorkoutDetail({ run, name = run.workoutSet?.name ?? "Outdoor Run" }: { run: Run; name?: string }) {
  const { colors, typography } = useAppTheme();
  const km = meters(run) / 1000;
  const active = run.accumulatedMs / 1000;
  const expired = routeExpired(run.start);
  const rows = expired ? [] : splits(run);
  const hasMultipleFullSplits = rows.filter(row => !row.partial).length > 1;
  const fastest = rows.reduce<number | null>((best, row, index) =>
    !row.partial && (best === null || row.seconds < rows[best].seconds) ? index : best, null);
  const metrics = [
    ["Distance", km.toFixed(2) + " km"], ["Active time", cardioTime(active)],
    ["Average pace", cardioPace(km ? active / km : null)],
    ["Elapsed time", cardioTime(run.end === null ? null : (run.end - run.start) / 1000)],
  ];
  if (run.effort) metrics.push(["Effort", run.effort + "/10"]);
  const card = { padding: 14, borderRadius: 18, gap: 10 };
  const heading = { color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 16 };
  const label = { color: colors.textMuted, fontSize: 13 };
  return <View style={{ gap: 12 }}>
    <WorkoutDetailCard title={run.type ? RUN_TYPE_LABELS[run.type] + " · " + name : name}
      subtitle={new Date(run.end ?? run.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      metrics={metrics} />
    {expired ? <Text style={label}>The 90-day route and split history has expired.</Text> : <>
      {run.points.length > 1 && <Card style={card}>
        <Text style={heading}>Route</Text>
        <RouteMap points={run.points} />
      </Card>}
      {rows.length > 0 && <Card style={card}>
        <Text style={heading}>Kilometre splits</Text>
        <View style={{ flexDirection: "row" }}>
          <Text style={[label, { flex: 1.4 }]}>Split</Text>
          <Text style={[label, { flex: 1, textAlign: "right" }]}>Time</Text>
          <Text style={[label, { flex: 1, textAlign: "right" }]}>Pace</Text>
        </View>
        {rows.map((row, i) => <View key={i} style={{ flexDirection: "row", paddingTop: 8,
          borderTopWidth: 1, borderColor: colors.border }}>
          <Text style={{ flex: 1.4, color: colors.text }}>
            {row.partial ? "Final " + (row.distance / 1000).toFixed(2) + " km" : "Kilometre " + (i + 1)}
            {fastest === i && hasMultipleFullSplits && <Text style={{ color: colors.success, fontSize: 12 }}> · Fastest</Text>}
          </Text>
          <Text style={{ flex: 1, textAlign: "right", color: colors.text }}>{cardioTime(row.seconds)}</Text>
          <Text style={{ flex: 1, textAlign: "right", color: colors.text }}>{cardioPace(row.seconds * 1000 / row.distance)}</Text>
        </View>)}
      </Card>}
    </>}
  </View>;
}

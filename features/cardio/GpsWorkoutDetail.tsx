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
  const expired = routeExpired(run.start);
  return <RecordedWorkoutDetail name={name} type={run.type} completed={run.end ?? run.start} km={meters(run) / 1000}
    active={run.accumulatedMs / 1000} elapsed={run.end === null ? null : (run.end - run.start) / 1000}
    effort={run.effort} expired={expired} rows={expired ? [] : splits(run)}
    map={run.points.length > 1 ? <RouteMap points={run.points} /> : null} />;
}

export function RecordedWorkoutDetail({ name, type, completed, km, active, elapsed, effort, expired, rows, map }: {
  name: string; type: Run["type"]; completed: number; km: number; active: number; elapsed: number | null;
  effort: number | null; expired?: boolean; rows: { seconds: number; distance: number; partial: boolean }[];
  map: React.ReactNode;
}) {
  const { colors, typography } = useAppTheme();
  const hasMultipleFullSplits = rows.filter(row => !row.partial).length > 1;
  const fastest = rows.reduce<number | null>((best, row, index) =>
    !row.partial && (best === null || row.seconds < rows[best].seconds) ? index : best, null);
  const metrics = [
    ["Distance", km.toFixed(2) + " km"], ["Active time", cardioTime(active)],
    ["Average pace", cardioPace(km ? active / km : null)],
    ["Elapsed time", cardioTime(elapsed)],
  ];
  if (effort) metrics.push(["Effort", effort + "/10"]);
  const card = { padding: 14, borderRadius: 18, gap: 10 };
  const heading = { color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 16 };
  const label = { color: colors.textMuted, fontSize: 13 };
  return <View style={{ gap: 12 }}>
    <WorkoutDetailCard title={type ? RUN_TYPE_LABELS[type] + " · " + name : name}
      subtitle={new Date(completed).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      metrics={metrics} />
    {expired ? <Text style={label}>The 90-day route and split history has expired.</Text> : <>
      {map && <Card style={card}>
        <Text style={heading}>Route</Text>
        {map}
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

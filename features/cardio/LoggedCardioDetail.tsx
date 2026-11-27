import React from "react";
import { Text, View } from "react-native";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { useAppTheme } from "@/lib/useAppTheme";
import { WorkoutDetailCard } from "./WorkoutDetailCard";

type LoggedSet = {
  set_number: number; set_id?: string; time_seconds?: number | null; distance?: number | null;
  weight_kg?: number | null; reps?: number | null;
};

function setMetrics(set: LoggedSet) {
  const metrics: string[][] = [];
  if (set.distance != null) metrics.push(["Distance", set.distance + " km"]);
  if (set.time_seconds != null) metrics.push(["Logged time", set.time_seconds === 0 ? "0:00" : cardioTime(set.time_seconds)]);
  if (set.distance && set.time_seconds) metrics.push(["Average pace", cardioPace(set.time_seconds / set.distance)]);
  if (set.weight_kg != null) metrics.push(["Weight", set.weight_kg + " kg"]);
  if (set.reps != null) metrics.push(["Reps", String(set.reps)]);
  return metrics;
}

export function LoggedCardioDetail({ title, sets, right }: { title: string; sets: LoggedSet[]; right?: React.ReactNode }) {
  const { colors } = useAppTheme();
  if (!sets.length) return null;
  if (sets.length === 1) return <WorkoutDetailCard title={title} metrics={setMetrics(sets[0])} right={right} />;

  const total: LoggedSet = { set_number: 0 };
  if (sets.every(set => set.distance != null)) {
    total.distance = Number(sets.reduce((sum, set) => sum + (set.distance ?? 0), 0).toFixed(2));
  }
  if (sets.every(set => set.time_seconds != null)) {
    total.time_seconds = sets.reduce((sum, set) => sum + (set.time_seconds ?? 0), 0);
  }
  const metrics = setMetrics(total);
  return <WorkoutDetailCard title={title} metrics={metrics} right={right}>
    {sets.map((set, index) => <View key={set.set_id ?? index}
      style={{ flexDirection: "row", gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontWeight: "600" }}>Set {set.set_number}</Text>
      <Text style={{ color: colors.textMuted, flex: 1, textAlign: "right" }}>
        {setMetrics(set).map(([label, value]) => label === "Reps" ? value + " reps" : value).join(" · ")}
      </Text>
    </View>)}
  </WorkoutDetailCard>;
}

import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/ui";
import { useAppTheme } from "@/lib/useAppTheme";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "@/app/features/cardio/tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { benchmarks, bestSegment, meters, type Run } from "./runMetrics";

export function RunInsights({ runs, open }: { runs: Run[]; open: (id: string) => void }) {
  const { colors } = useAppTheme();
  const [type, setType] = useState<RunType | null>(null);
  const results = useMemo(() => runs.filter(r => r.end !== null && (!type || r.type === type)), [runs, type]);
  const records = useMemo(() => benchmarks.map(distance => {
    let best: { time: number; run: Run } | null = null;
    for (const run of results) {
      const time = bestSegment(run.points, distance);
      if (time !== null && (!best || time < best.time)) best = { time, run };
    }
    return { distance, best };
  }), [results]);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const week = results.filter(r => r.start >= +monday);
  const longest = results.reduce<Run | null>((best, r) => !best || meters(r) > meters(best) ? r : best, null);
  const latest = results[0];
  const comparable = latest && results.slice(1).find(r => r.type === latest.type && Math.abs(meters(r) / meters(latest) - 1) <= 0.1);
  const pace = (r: Run) => r.accumulatedMs / meters(r);
  const style = { color: colors.text };
  return <View style={{ gap: 10 }}>
    <Text style={{ ...style, fontSize: 21, fontWeight: "600" }}>Recorded runs on this iPhone</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {[null, ...RUN_TYPES].map(t => <Button key={t ?? "all"} title={t ? RUN_TYPE_LABELS[t] : "All"}
        fullWidth={false} variant={type === t ? "primary" : "outline"} onPress={() => setType(t)} />)}
    </View>
    <Text style={style}>This week · {week.length} runs · {(week.reduce((sum, r) => sum + meters(r), 0) / 1000).toFixed(2)} km</Text>
    {comparable && <Text style={style}>Latest pace {cardioPace(pace(latest))} · previous similar run {cardioPace(pace(comparable))} ({new Date(comparable.start).toLocaleDateString()})</Text>}
    <Text style={{ ...style, fontWeight: "600" }}>GPS personal bests</Text>
    {records.map(({ distance, best }) => <Text key={distance} style={style}>{distance / 1000} km · {best ? cardioTime(best.time) + " · " + new Date(best.run.start).toLocaleDateString() : "No continuous GPS result"}</Text>)}
    {longest && <Text style={style}>Longest run · {(meters(longest) / 1000).toFixed(2)} km · {new Date(longest.start).toLocaleDateString()}</Text>}
    {results.map(r => <Button key={r.id} variant="outline" onPress={() => open(r.id)}
      title={new Date(r.start).toLocaleDateString() + " · " + (r.type ? RUN_TYPE_LABELS[r.type] : "Run") + " · " + (meters(r) / 1000).toFixed(2) + " km"} />)}
  </View>;
}

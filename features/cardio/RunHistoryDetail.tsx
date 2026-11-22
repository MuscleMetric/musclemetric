import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { Button, Card } from "@/ui";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { RUN_TYPE_LABELS } from "@/app/features/cardio/tracking/types";
import { routeSlot } from "./workoutOutdoor";
import RouteMap from "./RouteMap";
import { listRuns } from "./runStore";
import { restoreHistoryRun } from "./restoreRun";
import { legs, meters, routeExpired, splits, type Run } from "./runMetrics";

type Props = { name?: string; slot?: string; historyId: string; completedAt: string; recorded: boolean; distance?: number | null; duration?: number | null };

export function RunHistoryDetail(props: Props) {
  const { session } = useAuth();
  return session ? <PrivateDetail key={session.user.id + props.historyId} owner={session.user.id} {...props} /> : null;
}

function PrivateDetail({ owner, name = "Outdoor Run", slot, historyId, completedAt, recorded, distance, duration }: Props & { owner: string }) {
  const { colors } = useAppTheme();
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const expired = routeExpired(run?.start ?? Date.parse(completedAt));
  useEffect(() => {
    let active = true;
    async function load() {
      const candidates = (await listRuns(owner)).filter(item => item.historyId === historyId && item.end !== null);
      const local = candidates.find(item => item.workoutSet &&
        routeSlot(item.workoutSet.exerciseId, item.workoutSet.orderIndex, item.workoutSet.setNumber) === slot);
      if (local) return local;
      const standalone = recorded ? candidates.find(item => !item.workoutSet) : null;
      if (standalone) return standalone;
      if (slot) {
        const restored = await restoreHistoryRun(owner, historyId, slot);
        if (restored || !recorded) return restored;
      }
      return restoreHistoryRun(owner, historyId);
    }
    setStatus("loading");
    load().then(result => {
      if (active) { setRun(result); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [owner, historyId, slot, recorded, completedAt, attempt]);
  if (!recorded && !run) return null;

  const km = run ? meters(run) / 1000 : distance;
  const seconds = run ? run.accumulatedMs / 1000 : duration;
  const rows = run && !expired ? splits(run) : [];
  const full = rows.filter(row => !row.partial);
  const quickest = full.reduce((best, row, i) => row.seconds < full[best].seconds ? i : best, 0);
  const body = { color: colors.text };
  return <Card style={{ padding: 16, gap: 8 }}>
    <Text style={{ ...body, fontWeight: "700", fontSize: 20 }}>{run?.type ? RUN_TYPE_LABELS[run.type] + " · " + name : name}</Text>
    <Text style={body}>{km?.toFixed(2) ?? "—"} km · {cardioTime(seconds)} active · {cardioPace(km && seconds ? seconds / km : null)} average</Text>
    {run && run.end !== null && <Text style={body}>{cardioTime((run.end - run.start) / 1000)} elapsed{run.effort ? " · Effort " + run.effort + "/10" : ""}</Text>}
    {expired ? <Text style={{ color: colors.textMuted }}>Your 90-day route and split history has ended. Your workout totals are still here.</Text> :
      status === "loading" ? <Text style={body}>Opening route…</Text> :
      status === "error" ? <Button title="Retry loading route" onPress={() => setAttempt(n => n + 1)} /> :
      !run ? <Text style={body}>Route unavailable on this device. If you recorded offline, reopen MuscleMetric on the recording iPhone to sync.</Text> :
      <>
        <RouteMap points={run.points} />
        {legs(run.points).length > 1 && <Text style={body}>Gaps mark a pause or a break in GPS coverage.</Text>}
        {rows.length > 0 && <Text style={{ ...body, fontWeight: "600" }}>Kilometre splits</Text>}
        {full.length >= 2 && <Text style={body}>Kilometre {quickest + 1} was your fastest full kilometre at {cardioTime(full[quickest].seconds)}.</Text>}
        {rows.map((s, i) => <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={body}>{s.partial ? "Final " + (s.distance / 1000).toFixed(2) + " km" : "Kilometre " + (i + 1)}</Text>
          <Text style={body}>{cardioTime(s.seconds)} · {cardioPace(s.seconds * 1000 / s.distance)}</Text>
        </View>)}
      </>}
  </Card>;
}

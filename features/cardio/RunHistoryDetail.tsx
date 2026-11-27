import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { Button, Card } from "@/ui";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { routeSlot } from "./workoutOutdoor";
import { GpsWorkoutDetail } from "./GpsWorkoutDetail";
import { backupRoute } from "./syncRun";
import { listRuns } from "./runStore";
import { restoreHistoryRun } from "./restoreRun";
import { routeExpired, type Run } from "./runMetrics";

type Props = { fallback?: React.ReactNode; name?: string; slot?: string; historyId: string; completedAt: string; recorded: boolean; distance?: number | null; duration?: number | null };

export function RunHistoryDetail(props: Props) {
  const { session } = useAuth();
  return session ? <PrivateDetail key={session.user.id + props.historyId} owner={session.user.id} {...props} /> : <>{props.fallback}</>;
}

function PrivateDetail({ owner, fallback, name = "Outdoor Run", slot, historyId, completedAt, recorded, distance, duration }: Props & { owner: string }) {
  const { colors } = useAppTheme();
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [syncState, setSyncState] = useState<"idle" | "saving" | "error">("idle");
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
  if (!recorded && !run) return <>{fallback}</>;

  if (run) return <>
    <GpsWorkoutDetail run={run} name={name} />
    {!expired && !run.routeSynced && <Button variant="outline" loading={syncState === "saving"}
      title={syncState === "error" || run.autoBackup ? "Retry route sync" : "Back up route"}
      onPress={async () => {
        setSyncState("saving");
        try {
          await backupRoute(owner, run.id);
          setAttempt(n => n + 1);
          setSyncState("idle");
        } catch { setSyncState("error"); }
      }} />}
    {syncState === "error" && <Text accessibilityRole="alert" style={{ color: colors.textMuted }}>Route sync failed. Reconnect and retry.</Text>}
  </>;
  const body = { color: colors.text };
  return <Card style={{ padding: 16, gap: 8 }}>
    <Text style={{ ...body, fontWeight: "700", fontSize: 20 }}>{name}</Text>
    <Text style={body}>{distance?.toFixed(2) ?? "—"} km · {cardioTime(duration)} active · {cardioPace(distance && duration ? duration / distance : null)} average</Text>
    {expired ? <Text style={{ color: colors.textMuted }}>Your 90-day route and split history has ended. Your workout totals are still here.</Text> :
      status === "loading" ? <Text style={body}>Opening route…</Text> :
      status === "error" ? <Button title="Retry loading route" onPress={() => setAttempt(n => n + 1)} /> :
      <Text style={body}>Route unavailable on this device. If you recorded offline, reopen MuscleMetric on the recording iPhone to sync.</Text>}
  </Card>;
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { AuthRequiredState, Button, Screen, ScreenHeader } from "@/ui";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "./tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { finishRecorder, pauseRecorder, RunActionError, startRecorder } from "@/features/cardio/recorder";
import { activeMs, routeExpired, meters, personalBestsForRun, type Run } from "@/features/cardio/runMetrics";
import { discardDraft, listRuns, subscribeRuns } from "@/features/cardio/runStore";
import { backupRoute, saveRunHistory } from "@/features/cardio/syncRun";
import { restoreHistoryRun } from "@/features/cardio/restoreRun";
import { GpsWorkoutDetail } from "@/features/cardio/GpsWorkoutDetail";
import { RunInsights } from "@/features/cardio/RunInsights";

export default function OutdoorRun() {
  const { session } = useAuth();
  const { historyId, view, recordingId } = useLocalSearchParams<{ historyId?: string; view?: string; recordingId?: string }>();
  return session ? <Recorder key={[session.user.id, historyId, view, recordingId].join("/")} owner={session.user.id} historyId={historyId} recordingId={recordingId} progress={view === "progress"} /> : <AuthRequiredState />;
}

function Recorder({ owner, historyId, recordingId, progress }: { owner: string; historyId?: string; recordingId?: string; progress: boolean }) {
  const { colors } = useAppTheme();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [remote, setRemote] = useState<Run | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [type, setType] = useState<RunType | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true, sequence = 0, ready = false;
    const refresh = async () => {
      const ticket = ++sequence;
      try {
        const items = (await listRuns(owner)).filter(item => !item.workoutSet || (item.end !== null && !!item.type && !!item.historyId));
        if (!alive || ticket !== sequence) return;
        setRuns(items);
        if (historyId && !items.some(r => r.historyId === historyId)) {
          const restored = await restoreHistoryRun(owner, historyId);
          if (!alive || ticket !== sequence) return;
          setRemote(restored);
          if (!restored) setMessage("There is no private GPS backup for this workout.");
        }
        ready = true;
        setLoaded(true);
      } catch {
        if (alive) setMessage("Your run data could not be opened. Check your connection if restoring a backup, then retry.");
      }
    };
    const unsubscribe = subscribeRuns((changedOwner, id, changed) => {
      if (changedOwner !== owner || (changed?.workoutSet && (!changed.historyId || !changed.type))) return;
      if (!ready) { void refresh(); return; }
      setRuns(previous => {
        const remaining = previous.filter(r => r.id !== id);
        return changed ? [changed, ...remaining].sort((a, b) => b.start - a.start) : remaining;
      });
    });
    void refresh();
    return () => { alive = false; unsubscribe(); };
  }, [owner, historyId, revision]);

  const selectedRun = runs.find(r => r.id === (recordingId ?? selected));
  const draft = runs.find(r => r.end === null);
  const run = historyId ? runs.find(r => r.historyId === historyId) ?? remote :
    selectedRun ?? (progress || recordingId ? null : draft);
  const highlights = useMemo(() => run?.end != null && runs.some(r => r.id === run.id)
    ? personalBestsForRun(run, runs) : [], [run, runs]);
  const running = !!run && run.activeSince !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);
  const action = async (fn: () => Promise<unknown>, fallback: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { await fn(); } catch (e) { setMessage(e instanceof RunActionError ? e.message : fallback); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = useCallback((id: string, savedHistoryId?: string | null) => {
    if (savedHistoryId) {
      const local = runs.find(item => item.id === id && item.historyId === savedHistoryId);
      router.push({ pathname: "/features/progress/screens/historyDetail",
        params: { workoutHistoryId: savedHistoryId, ...(local ? { recordingId: local.id } : {}) } });
    } else {
      router.push({ pathname: "/features/cardio/outdoor-run", params: { recordingId: id } });
    }
  }, [runs]);
  const style = { color: colors.text };
  const muted = { color: colors.textMuted };
  const done = run?.end != null;
  const elapsed = run ? activeMs(run, now) / 1000 : 0;
  const km = run ? meters(run) / 1000 : 0;
  const last = run ? run.points[run.points.length - 1] : undefined;
  const canStart = loaded && !draft && !historyId && !recordingId && !progress && !run;
  const saveHistory = (r: Run) => void action(() => r.autoBackup ? backupRoute(owner, r.id) : saveRunHistory(owner, r.id), "Saved on this iPhone. Reconnect and retry workout history.");
  return <Screen>
    <ScreenHeader title={done || recordingId || historyId ? "Workout details" : progress ? "Running progress" : "Outdoor Run"} />
    <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 60 }}>
      {message ? <Text accessibilityRole="alert" style={style}>{message}</Text> : null}
      {!loaded && <Text style={muted}>{message ? "Run data unavailable" : "Opening your runs…"}</Text>}
      {(!loaded || (historyId && !run)) && !!message && <Button title="Retry" onPress={() => { setMessage(""); setRevision(n => n + 1); }} />}
      {canStart && <>
        <Text style={style}>Record distance and kilometre splits with your iPhone. Choose Always and enable Precise Location to keep measuring when the screen locks.</Text>
        <Text style={muted}>Finishing a new run saves the route and splits privately to your account for 90 days. Your workout totals stay in history.</Text>
        <Button title="Start outdoor run" loading={busy} onPress={() => void action(async () => {
          setType(null); setEffort(null); await startRecorder(owner);
        }, "Could not start GPS. Check location settings and retry.")} />
      </>}
      {loaded && recordingId && !run && <Text style={muted}>This recording is unavailable on this iPhone.</Text>}
      {run && !done && <>
        <Text style={{ ...style, fontSize: 22, fontWeight: "600" }}>{running ? "Recording" : "Paused"}</Text>
        <Text style={{ ...style, fontSize: 32, fontWeight: "700" }}>{km.toFixed(2)} km</Text>
        <Text style={style}>Active time {cardioTime(elapsed) === "—" ? "0:00" : cardioTime(elapsed)} · Pace {cardioPace(km ? elapsed / km : null)}</Text>
        {running && <Text style={muted}>{!last || last.leg !== run.leg || now - last.time > 30000 ? "Waiting for a reliable GPS fix. Check Precise Location and move into open sky." : "GPS signal received"}</Text>}
        {run.rejected > 0 && <Text style={muted}>{run.rejected} unreliable GPS samples excluded.</Text>}
        {running && <Button title="Pause or finish" disabled={busy} onPress={() => void action(() => pauseRecorder(owner, run.id), "Could not pause GPS. Check the recording status.")} />}
        {!running && <>
          <Button title="Resume" disabled={busy} onPress={() => void action(() => startRecorder(owner, run.id), "Could not resume GPS. Check location settings.")} />
          <Text style={style}>Run type · required to finish</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {RUN_TYPES.map(t => <Button fullWidth={false} key={t} title={RUN_TYPE_LABELS[t]} variant={type === t ? "primary" : "outline"} onPress={() => setType(t)} />)}
          </View>
          <Text style={style}>Effort · optional, from 1 (very easy) to 10 (maximal)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <Button key={n} title={String(n)} fullWidth={false}
              variant={effort === n ? "primary" : "outline"} onPress={() => setEffort(effort === n ? null : n)} />)}
          </View>
          <Button title="Finish and save run" disabled={busy || !type || km <= 0} onPress={() => type && void action(async () => {
            await finishRecorder(owner, run.id, type, effort);
            setSelected(run.id);
            if (run.autoBackup) await backupRoute(owner, run.id);
            else await saveRunHistory(owner, run.id);
          }, "Run saved on this iPhone. Reconnect to sync.")} />
          <Button title="Discard draft" variant="text" disabled={busy} onPress={() => Alert.alert("Discard this run?", "This removes the unfinished run and its route from your iPhone.", [
            { text: "Keep run", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => void action(() => discardDraft(owner, run.id), "Could not discard this draft.") },
          ])} />
        </>}
      </>}
      {run && done && <>
        <GpsWorkoutDetail run={run} />
        {highlights.map(pb => <Text key={pb.distance} style={{ color: colors.success, fontWeight: "600" }}>
          GPS best on this iPhone · {pb.distance / 1000} km in {cardioTime(pb.time)}
        </Text>)}
        {!run.historyId && <Button title="Retry workout history" disabled={busy} onPress={() => saveHistory(run)} />}
        {run.historyId && !routeExpired(run.start) && !run.routeSynced &&
          <Button variant="outline" title={run.autoBackup ? "Retry route sync" : "Back up route"} disabled={busy}
            onPress={() => void action(() => backupRoute(owner, run.id), "Route sync failed. Reconnect and retry.")} />}
        {!historyId && !recordingId && <Button title="Return to recorder" variant="secondary"
          onPress={() => { setSelected(null); setMessage(""); }} />}
      </>}
      {!!message && !done && <Button title="Open iPhone settings" variant="text" onPress={() => { void Linking.openSettings(); }} />}
      {loaded && !historyId && !recordingId && !run && (!draft || progress) && <RunInsights runs={runs} owner={owner} open={show} />}
    </ScrollView>
  </Screen>;
}

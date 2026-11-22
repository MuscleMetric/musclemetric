import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/authContext";
import { useAppTheme } from "@/lib/useAppTheme";
import { AuthRequiredState, Button, Screen, ScreenHeader } from "@/ui";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "./tracking/types";
import { cardioPace, cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { finishRecorder, pauseRecorder, RunActionError, startRecorder } from "@/features/cardio/recorder";
import { activeMs, legs, meters, personalBestsForRun, splits, type Run } from "@/features/cardio/runMetrics";
import { discardDraft, listRuns, subscribeRuns } from "@/features/cardio/runStore";
import { backupRoute, saveRunHistory } from "@/features/cardio/syncRun";
import { restoreHistoryRun } from "@/features/cardio/restoreRun";
import RouteMap from "@/features/cardio/RouteMap";
import { RunInsights } from "@/features/cardio/RunInsights";

export default function OutdoorRun() {
  const { session } = useAuth();
  const { historyId, view } = useLocalSearchParams<{ historyId?: string; view?: string }>();
  return session ? <Recorder key={[session.user.id, historyId, view].join("/")} owner={session.user.id} historyId={historyId} progress={view === "progress"} /> : <AuthRequiredState />;
}

function Recorder({ owner, historyId, progress }: { owner: string; historyId?: string; progress: boolean }) {
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
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true, sequence = 0, ready = false;
    const refresh = async () => {
      const ticket = ++sequence;
      try {
        const items = await listRuns(owner);
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
      if (changedOwner !== owner) return;
      if (!ready) { void refresh(); return; }
      setRuns(previous => {
        const remaining = previous.filter(r => r.id !== id);
        return changed ? [changed, ...remaining].sort((a, b) => b.start - a.start) : remaining;
      });
    });
    void refresh();
    return () => { alive = false; unsubscribe(); };
  }, [owner, historyId, revision]);

  const selectedRun = runs.find(r => r.id === selected);
  const draft = runs.find(r => r.end === null);
  const run = historyId ? runs.find(r => r.historyId === historyId) ?? remote :
    selectedRun ?? (progress ? null : draft);
  const highlights = useMemo(() => run?.end != null && runs.some(r => r.id === run.id)
    ? personalBestsForRun(run, runs) : [], [run, runs]);
  const running = !!run && run.activeSince !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);
  const action = async (fn: () => Promise<void>, fallback: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { await fn(); } catch (e) { setMessage(e instanceof RunActionError ? e.message : fallback); }
    finally { lock.current = false; setBusy(false); }
  };
  const show = useCallback((id: string) => {
    setSelected(id);
    setMessage("");
    scroll.current?.scrollTo({ y: 0, animated: true });
  }, []);
  const style = { color: colors.text };
  const muted = { color: colors.textMuted };
  const done = run?.end != null;
  const elapsed = run ? activeMs(run, now) / 1000 : 0;
  const km = run ? meters(run) / 1000 : 0;
  const last = run ? run.points[run.points.length - 1] : undefined;
  const canStart = loaded && !draft && !historyId && !progress && !run;
  const saveHistory = (r: Run) => void action(() => saveRunHistory(owner, r.id), "Saved on this iPhone. Reconnect and retry workout history.");
  return <Screen>
    <ScreenHeader title={progress ? "Running progress" : "Outdoor Run"} />
    <ScrollView ref={scroll} contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 60 }}>
      {message ? <Text accessibilityRole="alert" style={style}>{message}</Text> : null}
      {!loaded && <Text style={muted}>{message ? "Run data unavailable" : "Opening your runs…"}</Text>}
      {(!loaded || (historyId && !run)) && !!message && <Button title="Retry" onPress={() => { setMessage(""); setRevision(n => n + 1); }} />}
      {canStart && <>
        <Text style={style}>Record distance and kilometre splits with your iPhone. Choose Always and enable Precise Location to keep measuring when the screen locks.</Text>
        <Text style={muted}>Your route stays on this phone unless you choose a private backup.</Text>
        <Button title="Start outdoor run" loading={busy} onPress={() => void action(async () => {
          setType(null); setEffort(null); await startRecorder(owner);
        }, "Could not start GPS. Check location settings and retry.")} />
      </>}
      {run && <>
        <Text style={{ ...style, fontSize: 22, fontWeight: "600" }}>{done ? (run.type === "long_run" ? "Long run" : run.type ? RUN_TYPE_LABELS[run.type] + " run" : "Completed run") : running ? "Recording" : "Paused"}</Text>
        <Text style={{ ...style, fontSize: 32, fontWeight: "700" }}>{km.toFixed(2)} km</Text>
        <Text style={style}>Active time {cardioTime(elapsed) === "—" ? "0:00" : cardioTime(elapsed)} · Pace {cardioPace(km ? elapsed / km : null)}</Text>
        {running && <Text style={muted}>{!last || last.leg !== run.leg || now - last.time > 30000 ? "Waiting for a reliable GPS fix. Check Precise Location and move into open sky." : "GPS signal received"}</Text>}
        {run.rejected > 0 && <Text style={muted}>{run.rejected} unreliable GPS samples excluded.</Text>}
        {running && <Button title="Pause or finish" disabled={busy} onPress={() => void action(() => pauseRecorder(owner, run.id), "Could not pause GPS. Check the recording status.")} />}
        {!running && !done && <>
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
            show(run.id);
            await saveRunHistory(owner, run.id);
          }, "Run saved on this iPhone. Reconnect and retry workout history.")} />
          <Button title="Discard draft" variant="text" disabled={busy} onPress={() => Alert.alert("Discard this run?", "This removes the unfinished run and its route from your iPhone.", [
            { text: "Keep run", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => void action(() => discardDraft(owner, run.id), "Could not discard this draft.") },
          ])} />
        </>}
        {done && <>
          <Text style={muted}>{new Date(run.start).toLocaleString()} · Elapsed {cardioTime(((run.end ?? run.start) - run.start) / 1000)}{run.effort ? " · RPE " + run.effort + "/10" : ""}</Text>
          <Text style={style}>{run.historyId ? "Saved to workout history" : "Saved on this iPhone · workout history pending"}</Text>
          {!run.historyId && <Button title="Retry workout history" disabled={busy} onPress={() => saveHistory(run)} />}
          {highlights.map(pb => <Text key={pb.distance} style={{ color: colors.success, fontWeight: "600" }}>
            GPS best on this iPhone · {pb.distance / 1000} km in {cardioTime(pb.time)}
          </Text>)}
          <RouteMap key={run.id} points={run.points} />
          {legs(run.points).length > 1 && <Text style={muted}>The route has separate sections where tracking paused or GPS signal was lost.</Text>}
          <Text style={{ ...style, fontWeight: "600" }}>GPS splits · active pace</Text>
          {splits(run).map((s, i) => <Text key={i} style={style}>{s.partial ? "Final " + (s.distance / 1000).toFixed(2) + " km" : "Kilometre " + (i + 1)} · {cardioTime(s.seconds)} · {cardioPace(s.seconds / (s.distance / 1000))}</Text>)}
          {run.routeSynced ? <Text style={muted}>Private route backed up</Text> : <Button variant="outline" title="Back up private route" disabled={busy} onPress={() => void action(() => backupRoute(owner, run.id), "Private backup is unavailable. The complete route and splits are saved on this iPhone.")} />}
          {!historyId && <Button title={progress ? "Back to runs" : "Return to recorder"} variant="secondary" onPress={() => { setSelected(null); setMessage(""); }} />}
        </>}
      </>}
      {!!message && !done && <Button title="Open iPhone settings" variant="text" onPress={() => { void Linking.openSettings(); }} />}
      {loaded && !historyId && !run && (!draft || progress) && <RunInsights runs={runs} open={show} />}
    </ScrollView>
  </Screen>;
}

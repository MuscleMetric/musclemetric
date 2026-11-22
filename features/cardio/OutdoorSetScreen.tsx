import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { Button } from "@/ui";
import { RUN_TYPES, RUN_TYPE_LABELS, type RunType } from "@/app/features/cardio/tracking/types";
import { cardioTime } from "@/app/features/progress/deep-analytics/utils/cardioFormat";
import { currentPace } from "./runActivity";
import { activeMs, meters, type Run } from "./runMetrics";
import { startRecorder, pauseRecorder, finishRecorder } from "./recorder";
import { discardDraft } from "./runStore";

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <View accessible accessibilityLabel={[label, value, unit].filter(Boolean).join(" ")}
    style={{ flex: 1, justifyContent: "center", alignItems: "center", borderBottomWidth: 1, borderColor: "#273346" }}>
    <Text style={{ color: "#cbd5e1", fontWeight: "600", fontSize: 18 }}>{label}</Text>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: "#fff", fontSize: 76, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
    {unit && <Text style={{ color: "#cbd5e1", fontSize: 16 }}>{unit}</Text>}
  </View>;
}

export function OutdoorSetScreen({ run }: { run: Run }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now);
  const [review, setReview] = useState(false);
  const [type, setType] = useState<RunType | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const paused = run.activeSince === null;
  const name = run.workoutSet!.name;
  const runningExercise = /\brun(?:ning)?\b/i.test(name);
  useEffect(() => {
    if (paused) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [paused]);
  async function act(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try { await operation(); }
    catch (error) { Alert.alert(name, error instanceof Error ? error.message : "Try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const pace = currentPace(run, now);
  return <Modal visible presentationStyle="fullScreen" onRequestClose={() => { if (review) setReview(false); }}>
    <View style={{ flex: 1, backgroundColor: "#080d14", paddingHorizontal: 20,
      paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16), gap: 6 }}>
      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>{name}{paused ? " · Paused" : ""}</Text>
      {review ? <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 20 }}>
        {runningExercise && <>
          <Text style={{ color: "#fff" }}>Run type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{RUN_TYPES.map(t =>
            <Button key={t} fullWidth={false} title={RUN_TYPE_LABELS[t]} onPress={() => setType(t)} variant={type === t ? "primary" : "secondary"} />)}</View>
        </>}
        <Text style={{ color: "#fff" }}>Effort (optional)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
          <Button key={n} fullWidth={false} title={String(n)} variant={effort === n ? "primary" : "secondary"} onPress={() => setEffort(effort === n ? null : n)} />)}</View>
        <Button title="Save set and return to workout" disabled={busy || (runningExercise && !type)} onPress={() => void act(() => finishRecorder(run.owner, run.id, type, effort))} />
        <Button title="Back" variant="secondary" onPress={() => setReview(false)} />
      </ScrollView> : <>
        <Metric label="Active time" value={cardioTime(activeMs(run, now) / 1000).replace("—", "0:00")} />
        <Metric label="Current pace" value={pace ? cardioTime(pace) : "—"} unit={pace || paused ? "min/km" : "Waiting for GPS pace"} />
        <Metric label="Distance" value={(meters(run) / 1000).toFixed(2)} unit="km" />
        <Button title={paused ? "Resume" : "Pause"} disabled={busy} onPress={() => void act(() => paused ? startRecorder(run.owner, run.id) : pauseRecorder(run.owner, run.id))} />
        {paused && <Button title={meters(run) > 0 ? "Finish exercise" : "Discard recording"} variant="secondary" disabled={busy} onPress={() => {
          if (meters(run) > 0) setReview(true);
          else Alert.alert("Discard recording?", "No distance has been recorded.", [{ text: "Keep", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: () => void act(() => discardDraft(run.owner, run.id)) }]);
        }} />}
      </>}
    </View>
  </Modal>;
}

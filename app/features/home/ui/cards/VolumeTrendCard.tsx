import React, { useEffect, useMemo, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useAppTheme } from "../../../../../lib/useAppTheme";
import { useAuth } from "../../../../../lib/authContext";
import { Card, Pill } from "@/ui";
import { loadWeeklyDistance } from "@/features/cardio/analyticsData";

type SparkPoint = { label: string; value: number };
const int = (n: number) => Math.round(n).toLocaleString("en-GB");

function graph(values: number[]) {
  const width = 320, height = 92, padX = 12, top = 10, bottom = 78;
  const max = Math.max(1, ...values);
  const points = values.map((value, i) => ({
    x: padX + i * (width - 2 * padX) / Math.max(1, values.length - 1),
    y: bottom - (Math.max(0, value) / max) * (bottom - top),
  }));
  return { points, path: points.map((p, i) => (i ? "L " : "M ") + p.x + " " + p.y).join(" ") };
}

function Trend({ data, color, empty }: { data: SparkPoint[]; color: string; empty: string }) {
  const { colors } = useAppTheme();
  if (!data.length) return <Text style={{ color: colors.textMuted, paddingVertical: 12 }}>{empty}</Text>;
  const chart = graph(data.map(point => Number(point.value) || 0));
  return <View>
    <Svg width="100%" height={92} viewBox="0 0 320 92">
      {[22, 50, 78].map(y => <Line key={y} x1={0} x2={320} y1={y} y2={y}
        stroke={colors.border} strokeDasharray="4 5" />)}
      <Path d={chart.path} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {chart.points.map((point, i) => <Circle key={i} cx={point.x} cy={point.y} r={4} fill={color} />)}
    </Svg>
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{data[0]?.label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{data[data.length - 1]?.label}</Text>
    </View>
  </View>;
}

function weekStarts() {
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7 - 21);
  return Array.from({ length: 4 }, (_, i) => new Date(monday.getTime() + i * 7 * 86400000));
}

function delta(current: number, previous: number): number | null {
  return previous > 0 ? Math.round((current - previous) / previous * 100) : null;
}

function badge(value: number | null) {
  return value == null ? "—" : (value > 0 ? "+" : "") + value + "%";
}

export function VolumeTrendCard({ card }: { card: any; summary?: any }) {
  const { colors, typography, layout } = useAppTheme();
  const { session } = useAuth();
  const owner = session?.user?.id;
  const styles = useMemo(() => StyleSheet.create({
    card: { padding: layout.space.lg, borderRadius: layout.radius.xl },
    heading: { color: colors.text, fontSize: typography.size.h2, fontFamily: typography.fontFamily.bold },
    title: { color: colors.text, fontSize: typography.size.sub, fontFamily: typography.fontFamily.bold },
    muted: { color: colors.textMuted, fontSize: typography.size.meta },
    value: { color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: typography.size.h2 },
  }), [colors, typography, layout]);

  const weight: SparkPoint[] = Array.isArray(card?.sparkline) ?
    card.sparkline.map((p: any) => ({ label: String(p.label ?? ""), value: Math.max(0, Number(p.value) || 0) })) : [];
  const weightNow = Number(card?.value ?? 0);
  const weightDelta = card?.delta_pct == null ? null : Number(card.delta_pct);
  const [distance, setDistance] = useState<SparkPoint[] | null>(null);
  const [distanceError, setDistanceError] = useState(false);

  useEffect(() => {
    if (!owner) { setDistance(null); return; }
    const weeks = weekStarts();
    let active = true;
    setDistance(null);
    setDistanceError(false);
    void loadWeeklyDistance(owner, weeks[0].toISOString()).then(rows => {
      if (!active) return;
      const totals = [0, 0, 0, 0];
      for (const row of rows) {
        const week = Math.floor((row.date - weeks[0].getTime()) / (7 * 86400000));
        if (week >= 0 && week < 4) totals[week] += row.km;
      }
      setDistance(weeks.map((week, i) => ({
        label: week.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
        value: Number(totals[i].toFixed(2)),
      })));
    }).catch(() => { if (active) setDistanceError(true); });
    return () => { active = false; };
  }, [owner, card?.value]);

  const distanceNow = distance?.[3]?.value ?? 0;
  const distanceDelta = distance ? delta(distanceNow, distance[2].value) : null;
  return <Card style={styles.card}>
    <View style={{ gap: layout.space.md }}>
      <Text style={styles.heading}>Training volume</Text>
      <Text style={styles.muted}>Weekly totals · Monday to Sunday · last 4 weeks</Text>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>Weight moved</Text>
          <Pill label={badge(weightDelta)} tone={weightDelta == null ? "neutral" : weightDelta >= 0 ? "success" : "warning"} />
        </View>
        <Text style={styles.value}>{int(weightNow)} kg</Text>
        <Trend data={weight} color={colors.primary} empty="No strength volume yet" />
      </View>

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>Distance covered</Text>
          {distance && <Pill label={badge(distanceDelta)} tone={distanceDelta == null ? "neutral" : distanceDelta >= 0 ? "success" : "warning"} />}
        </View>
        <Text style={styles.value}>{distance ? distanceNow.toFixed(2) + " km" : "—"}</Text>
        {distanceError
          ? <Text style={styles.muted}>Could not load distance history.</Text>
          : distance ? <Trend data={distance} color={colors.success} empty="No distance yet" />
            : <Text style={styles.muted}>Loading distance…</Text>}
      </View>
    </View>
  </Card>;
}

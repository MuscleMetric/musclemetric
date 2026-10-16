import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/useAppTheme';
import type { CardioAnalytics, CardioSession } from '../types';
import { cardioDistance, cardioPace, cardioTime, positiveNumber } from '../utils/cardioFormat';

type Props = { name: string; data?: CardioAnalytics; timezone?: string };
type Metric = 'distance_km' | 'duration_seconds' | 'pace_seconds_per_km';

function sessionDate(iso: string, timezone?: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: timezone || 'UTC' });
}

function CardioTrend({ title, subtitle, sessions, metric, format, timezone }: {
  title: string; subtitle: string; sessions: CardioSession[]; metric: Metric;
  format: (value: number | string | null) => string; timezone?: string;
}) {
  const { colors, typography, layout } = useAppTheme();
  const points = sessions.filter(session => positiveNumber(session[metric]) != null);
  const max = Math.max(1, ...points.map(session => Number(session[metric])));
  return (
    <View style={{ padding: layout.space.lg, borderRadius: layout.radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 12 }}>
      <Text style={{ color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 18 }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{subtitle}</Text>
      {points.length === 0 ? <Text style={{ color: colors.textMuted }}>No valid entries for this metric yet.</Text> : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end', paddingTop: 8 }}>
            {points.map(session => (
              <View key={session.session_id} accessible accessibilityLabel={`${sessionDate(session.completed_at, timezone)}: ${format(session[metric])}`} style={{ alignItems: 'center', width: 64, gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 11 }}>{format(session[metric])}</Text>
                <View style={{ height: 100, justifyContent: 'flex-end' }}>
                  <View style={{ height: Math.max(2, Number(session[metric]) / max * 100), width: 30, borderRadius: 6, backgroundColor: colors.primary }} />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sessionDate(session.completed_at, timezone)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export function CardioAnalyticsView({ name, data, timezone }: Props) {
  const { colors, typography, layout } = useAppTheme();
  const styles = StyleSheet.create({
    title: { color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 28 },
    muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
    section: { padding: layout.space.lg, borderRadius: layout.radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
    heading: { color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 18 },
  });
  if (!data || data.session_count === 0) return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.heading}>No cardio sessions to show yet</Text>
      <Text style={styles.muted}>Log distance or time for this exercise to see your cardio analytics. This view covers the last 365 days.</Text>
    </View>
  );
  const stats = [
    ['Sessions', String(data.session_count)],
    ['Total distance', cardioDistance(data.total_distance_km)],
    ['Logged time', cardioTime(data.total_duration_seconds)],
    ['Average pace', cardioPace(data.average_pace_seconds_per_km)],
    ['Longest session', cardioDistance(data.longest_distance_km)],
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.muted}>Cardio analytics · Last 365 days</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {stats.map(([label, value]) => (
          <View key={label} style={[styles.section, { flexGrow: 1, flexBasis: '44%' }]}>
            <Text style={styles.muted}>{label}</Text>
            <Text style={{ color: colors.text, fontFamily: typography.fontFamily.bold, fontSize: 21 }}>{value}</Text>
          </View>
        ))}
      </View>
      {data.latest && <View style={styles.section}>
        <Text style={styles.heading}>Latest session · {sessionDate(data.latest.completed_at, timezone)}</Text>
        <Text style={{ color: colors.text }}>{cardioDistance(data.latest.distance_km)} · {cardioTime(data.latest.duration_seconds)} · {cardioPace(data.latest.pace_seconds_per_km)}</Text>
      </View>}
      <Text style={styles.muted}>Time comes from logged exercise entries. Pace uses only entries with both distance and time and is weighted by distance. Route, terrain and effort can vary, so a faster pace alone does not prove improved fitness.</Text>
      <CardioTrend title="Distance per session" subtitle="Your last 12 logged sessions, oldest first." sessions={data.sessions} metric="distance_km" format={cardioDistance} timezone={timezone} />
      <CardioTrend title="Time per session" subtitle="Recorded exercise time, excluding entries without a time." sessions={data.sessions} metric="duration_seconds" format={cardioTime} timezone={timezone} />
      <CardioTrend title="Pace per session" subtitle="Lower is faster. Sessions without paired distance and time are excluded." sessions={data.sessions} metric="pace_seconds_per_km" format={cardioPace} timezone={timezone} />
      <View style={styles.section}>
        <Text style={styles.heading}>Recent sessions</Text>
        {[...data.sessions].reverse().map(session => <View key={session.session_id} style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontFamily: typography.fontFamily.semibold }}>{sessionDate(session.completed_at, timezone)}</Text>
          <Text style={styles.muted}>{cardioDistance(session.distance_km)} · {cardioTime(session.duration_seconds)} · {cardioPace(session.pace_seconds_per_km)}</Text>
        </View>)}
      </View>
    </View>
  );
}

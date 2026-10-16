import type { WorkoutSnapshot } from '../types';
import { fmtVolume, toNumber } from './format';

export type SummaryStat = { label: string; value: string; unit?: string };

function duration(seconds: number): string {
  if (seconds <= 0) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remaining}` : `${minutes}:${remaining}`;
}

export function workoutSummary(snapshot: WorkoutSnapshot | null): SummaryStat[] {
  const volume = { label: 'VOLUME', value: fmtVolume(snapshot?.total_volume ?? 0), unit: 'kg' };
  const distanceKm = toNumber(snapshot?.total_distance_km);
  const distance = { label: 'DISTANCE', value: distanceKm > 0 ? String(Math.round(distanceKm * 100) / 100) : '—', unit: 'km' };
  const cardioSeconds = toNumber(snapshot?.cardio_duration_seconds);
  const time = { label: 'TIME', value: duration(cardioSeconds > 0 ? cardioSeconds : toNumber(snapshot?.duration_seconds)) };
  const exercises = { label: 'EXERCISES', value: String(Math.max(0, toNumber(snapshot?.exercises_count))) };
  if (snapshot?.workout_kind === 'cardio') return [distance, time, exercises];
  if (snapshot?.workout_kind === 'mixed') return [volume, distance, time];
  // Old backend responses and strength workouts retain the familiar stats.
  return [volume, { label: 'SETS', value: String(Math.max(0, toNumber(snapshot?.sets_count))) }, exercises];
}

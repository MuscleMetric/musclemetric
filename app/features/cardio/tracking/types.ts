/**
 * MuscleMetric v1.1.0 GPS recording contracts.
 * Private tracking data; never spread route points into public social payloads.
 * This module is not yet wired to screens. The recorder will use it in PR 2.
 */
export const RUN_TYPES = [
  "easy",
  "tempo",
  "intervals",
  "long_run",
  "race",
] as const;

export type RunType = (typeof RUN_TYPES)[number];
export type CardioRecordingStatus = "recording" | "paused" | "completed";
export type CardioRecordingSource = "gps" | "manual";
export type CardioSplitSource = "gps" | "manual";
export type EffortRpe = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: "Easy",
  tempo: "Tempo",
  intervals: "Intervals",
  long_run: "Long Run",
  race: "Race",
};

export type CardioRecording = {
  id: string;
  user_id: string;
  workout_history_id: string | null;
  source: CardioRecordingSource;
  status: CardioRecordingStatus;
  run_type: RunType | null;
  effort_rpe: EffortRpe | null;
  started_at: string;
  completed_at: string | null;
  distance_meters: number;
  elapsed_seconds: number;
  moving_seconds: number | null;
  created_at: string;
};

export type CardioRoutePoint = {
  id?: number;
  recording_id: string;
  point_index: number;
  recorded_at: string;
  elapsed_seconds: number;
  latitude: number;
  longitude: number;
  altitude_m: number | null;
  horizontal_accuracy_m: number | null;
};

export type CardioSplit = {
  id: string;
  recording_id: string;
  split_index: number;
  distance_meters: number;
  duration_seconds: number;
  end_elapsed_seconds: number;
  is_partial: boolean;
  source: CardioSplitSource;
};

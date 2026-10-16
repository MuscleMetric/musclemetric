export type Confidence = "low" | "medium" | "high";

export type TrendDirection = "up" | "flat" | "down";

export type DeepAnalyticsPayload = {
  meta: {
    exercise_type?: "strength" | "cardio";
    exercise_id: string;
    exercise_name: string;
    unit: "kg";
    generated_at?: string;
    timezone?: string;
  };
  cardio?: CardioAnalytics;
  cards: {
    current: {
      completed_at: string;
      top_weight: number;
      top_set: { weight_kg: number; reps: number; e1rm: number } | null;
    } | null;

    best_set: {
      e1rm: number;
      weight_kg: number;
      reps: number;
      completed_at: string;
    } | null;

    est_1rm: { value: number };
  };
  charts: {
    volume_trend: { date: string; volume: number }[];
    weight_vs_reps: {
      reps: number;
      weight_kg: number;
      e1rm: number;
      completed_at: string;
    }[];
    set_contribution: {
      set_id: string;
      set_number: number;
      volume: number;
      weight_kg: number;
      reps: number;
    }[];
    progress_over_time?: {
      date: string;
      top_weight: number;
      top_e1rm: number;
    }[];
  };
};

export type CardioSession = {
  session_id: string;
  completed_at: string;
  distance_km: number | string | null;
  duration_seconds: number | string | null;
  pace_seconds_per_km: number | string | null;
};

export type CardioAnalytics = {
  session_count: number;
  total_distance_km: number | string;
  total_duration_seconds: number | string;
  longest_distance_km: number | string | null;
  average_pace_seconds_per_km: number | string | null;
  latest: CardioSession | null;
  sessions: CardioSession[];
};

export type DeepAnalyticsInsightType =
  | "improving"
  | "stable"
  | "regressing"
  | "plateau"
  | "not_enough_data"
  | "new_best"
  | "volume_up"
  | "volume_down";

export type DeepAnalyticsInsight = {
  type: DeepAnalyticsInsightType;
  title: string;
  description: string;
  confidence: Confidence;
};

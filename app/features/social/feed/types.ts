// app/features/social/feed/types.ts

export type WorkoutSnapshot = {
  workout_history_id: string;
  workout_id: string | null;
  workout_title: string | null;
  workout_image_key: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  exercises_count: number;
  sets_count: number;
  workout_kind?: "strength" | "cardio" | "mixed";
  total_distance_km?: number | string | null;
  cardio_duration_seconds?: number | string | null;
  total_volume: number | string; // numeric may arrive as string
};

export type PrSnapshot = {
  note?: string;
  is_pr?: boolean;
  metric?: string; // "weight_increase" etc

  exercise_id?: string;
  exercise_name?: string;

  last_done_at?: string;

  prev_best_weight?: number;
  recent_best_weight?: number;

  pr_delta?: number;

  // future (to match x 5):
  recent_best_reps?: number;
};

export type FeedRow = {
  post_id: string;
  user_id: string;
  user_name: string | null;
  user_username: string | null;

  post_type: "workout" | "pr" | "text" | string;
  visibility: "public" | "followers" | "private" | string;
  caption: string | null;
  created_at: string;

  workout_history_id: string | null;
  workout_snapshot: WorkoutSnapshot | null;

  exercise_id: string | null;
  exercise_name: string | null;

  pr_snapshot: PrSnapshot | null;

  like_count: number;
  comment_count: number;
  viewer_liked: boolean;
};

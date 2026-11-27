import { supabase } from "@/lib/supabase";
import type { CommentRow, WorkoutDetailsPayload } from "./types";

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase.rpc("get_post_comments", { p_post_id: postId, p_limit: 50 });
  if (error) throw error;
  return data ?? [];
}

export async function saveComment(postId: string, body: string) {
  const { error } = await supabase.rpc("add_post_comment", { p_post_id: postId, p_body: body });
  if (error) throw error;
}

export async function fetchWorkoutDetails(postId: string): Promise<WorkoutDetailsPayload | null> {
  const { data, error } = await supabase.rpc("get_post_workout_details", { p_post_id: postId });
  return error ? null : data?.[0] ?? null;
}

import { useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { loadGoalRoadmap } from "@/lib/plans/loadGoalRoadmap";
import { targetsForWorkout } from "@/lib/plans/goalRoadmap";
import type { LiveWorkoutDraft } from "./state/types";

export function useSessionTargets(
  draft: LiveWorkoutDraft | null,
  userId: string | null,
  update: (mutate: (current: LiveWorkoutDraft) => LiveWorkoutDraft) => void,
) {
  const pending =
    draft?.userId === userId && draft?.isPlanWorkout && !draft.sessionTargets
      ? draft
      : null;
  const draftId = pending?.draftId;
  const slot = pending?.planWorkoutId;
  const workout = pending?.workoutId;
  const startedAt = pending?.startedAt;
  useEffect(() => {
    if (!slot || !workout || !userId || !startedAt) return;
    let cancelled = false;
    let busy = false;
    async function load() {
      if (busy || !slot || !startedAt) return;
      busy = true;
      try {
        const { data, error } = await supabase
          .from("plan_workouts")
          .select("plan_id,plans!inner(user_id)")
          .eq("id", slot)
          .eq("workout_id", workout)
          .eq("plans.user_id", userId)
          .maybeSingle();
        if (error || cancelled) return;
        const targets = data
          ? targetsForWorkout(
              await loadGoalRoadmap(data.plan_id),
              slot,
              startedAt,
            )
          : {};
        if (!cancelled)
          update((current) =>
            current.draftId === draftId && current.userId === userId
              ? { ...current, sessionTargets: targets }
              : current,
          );
      } catch {
        // Logging remains available offline. Retry when the app returns to the foreground.
      } finally {
        busy = false;
      }
    }
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [draftId, slot, workout, startedAt, userId, update]);
}

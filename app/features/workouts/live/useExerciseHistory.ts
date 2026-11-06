import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import type { LiveExerciseDraft, LiveWorkoutDraft } from "./state/types";

type Update = (mutate: (draft: LiveWorkoutDraft) => LiveWorkoutDraft) => void;
type HistoryRow = { exercise_id: string; last_session: LiveExerciseDraft["lastSession"]; best_set_6m: LiveExerciseDraft["bestSet6m"] };

function pendingIds(exercises: LiveExerciseDraft[], template: boolean) {
  return [...new Set(exercises
    .filter(ex => !ex.historyStatsResolved && Boolean(ex.workoutExerciseId) === template)
    .map(ex => ex.exerciseId))].sort().join(",");
}

// Keep the request stable while sets are edited. Resumed older drafts have
// no historyResolved flag and are refreshed once using their original scope.
export function useExerciseHistory(draft: LiveWorkoutDraft | null, userId: string | null, update: Update) {
  const [failedRequest, setFailedRequest] = useState<string | null>(null);
  const active = userId && userId === draft?.userId ? draft : null;
  const draftId = active?.draftId;
  const workoutId = active?.workoutId ?? null;
  const templateIds = pendingIds(active?.exercises ?? [], true);
  const addedIds = pendingIds(active?.exercises ?? [], false);

  const requestKey = JSON.stringify([userId, draftId, templateIds, addedIds]);

  useEffect(() => {
    if (!draftId || !userId || (!templateIds && !addedIds)) return;
    let cancelled = false;
    let loading = false;

    async function load() {
      if (loading) return;
      loading = true;
      try {
        const fetchGroup = async (ids: string, preferred: string | null) => {
          if (!ids) return [];
          const { data, error } = await supabase.rpc("get_live_exercise_history_stats", {
            p_exercise_ids: ids.split(","),
            p_preferred_workout_id: preferred,
            p_expected_user_id: userId,
          });
          if (error) throw error;
          return (data ?? []) as HistoryRow[];
        };
        const [template, added] = await Promise.all([
          fetchGroup(templateIds, workoutId), fetchGroup(addedIds, null),
        ]);
        if (cancelled || (!template.length && !added.length)) return;
        const templates = new Map(template.map(row => [row.exercise_id, row]));
        const additions = new Map(added.map(row => [row.exercise_id, row]));
        update(current => {
          if (current.draftId !== draftId || current.userId !== userId) return current;
          let changed = false;
          const exercises = current.exercises.map(ex => {
            const history = (ex.workoutExerciseId ? templates : additions).get(ex.exerciseId);
            if (!history || ex.historyStatsResolved) return ex;
            changed = true;
            return { ...ex, lastSession: history.last_session, bestSet6m: history.best_set_6m,
              bestE1rm6m: history.best_set_6m?.e1rm ?? null, historyResolved: true, historyStatsResolved: true };
          });
          return changed ? { ...current, exercises } : current;
        });
        if (!cancelled) setFailedRequest(null);
      } catch {
        if (!cancelled) setFailedRequest(requestKey);
        // History is optional during logging. Retry on foreground or draft reopen.
      } finally {
        loading = false;
      }
    }
    void load();
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") void load();
    });
    return () => { cancelled = true; sub.remove(); };
  }, [userId, draftId, workoutId, templateIds, addedIds, requestKey, update]);
  return failedRequest === requestKey;
}

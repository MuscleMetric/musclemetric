// app/features/workouts/live/session/ActiveWorkoutLiveActivityBridge.tsx

import { useEffect, useState } from "react";
import { currentRecorder, subscribeRuns } from "@/features/cardio/runStore";
import { useActiveWorkoutSession } from "./useActiveWorkoutSession";
import { useLiveActivitySync } from "../liveActivity/useLiveActivitySync";

export function ActiveWorkoutLiveActivityBridge() {
  const { activeDraft, hasActiveWorkout } = useActiveWorkoutSession();

  const [outdoorDraftId, setOutdoorDraftId] = useState<string | null>(null);
  const owner = activeDraft?.userId;
  useEffect(() => {
    if (!owner) return;
    let active = true;
    let changed = false;
    const unsubscribe = subscribeRuns((user, _id, run) => {
      if (user !== owner) return;
      changed = true;
      if (!run || run.workoutSet) setOutdoorDraftId(run?.end === null ? run.workoutSet?.draftId ?? null : null);
    });
    void currentRecorder().then(run => {
      if (active && !changed) setOutdoorDraftId(run?.owner === owner && run.end === null ? run.workoutSet?.draftId ?? null : null);
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [owner]);
  useLiveActivitySync(activeDraft, hasActiveWorkout && !(outdoorDraftId && outdoorDraftId === activeDraft?.draftId));

  return null;
}
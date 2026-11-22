import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";
import { meters, type Run } from "./runMetrics";

export interface OutdoorSet {
  draftId: string;
  exerciseId: string;
  name: string;
  orderIndex: number;
  setNumber: number;
}

export function isOutdoorCardio(name: string, type: string | null) {
  return type?.toLowerCase() === "cardio" && /\boutdoor\b/i.test(name);
}

export function routeSlot(exerciseId: string, orderIndex: number, setNumber: number) {
  return [exerciseId, orderIndex, setNumber].join(":");
}

export function applyRecordedSet(draft: LiveWorkoutDraft, run: Run): LiveWorkoutDraft {
  const target = run.workoutSet;
  if (!target || draft.userId !== run.owner || target.draftId !== draft.draftId || run.end === null) return draft;
  const exercise = draft.exercises.find(ex => ex.exerciseId === target.exerciseId && ex.orderIndex === target.orderIndex);
  const set = exercise?.sets.find(s => s.setNumber === target.setNumber && !s.dropIndex);
  if (!exercise || !set || set.gpsRecordingId === run.id || set.timeSeconds || set.distance) return draft;
  return { ...draft, exercises: draft.exercises.map(ex => ex !== exercise ? ex : {
    ...ex, sets: ex.sets.map(s => s !== set ? s : { ...s, gpsRecordingId: run.id,
      distance: meters(run) / 1000, timeSeconds: Math.max(1, Math.round(run.accumulatedMs / 1000)) }),
  }) };
}

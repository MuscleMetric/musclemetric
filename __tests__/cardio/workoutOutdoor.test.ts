import { applyRecordedSet, isOutdoorCardio } from "@/features/cardio/workoutOutdoor";
import type { Run } from "@/features/cardio/runMetrics";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";
import { buildRpcPayloadFromDraft } from "@/lib/saveWorkout";

jest.mock("@/lib/workoutSaveRpc", () => ({}));
jest.mock("@/lib/workoutSaveIdentity", () => ({}));
const draft = {
  draftId: "draft", userId: "owner", exercises: [
    { name: "Squat", exerciseId: "squat", orderIndex: 0, type: "strength", sets: [{ setNumber: 1, reps: 5, weight: 100 }] },
    { name: "Outdoor Run", exerciseId: "run", orderIndex: 1, type: "cardio", sets: [{ setNumber: 1, distance: null, timeSeconds: null }] },
  ],
} as LiveWorkoutDraft;
const run = { id: "recording", owner: "owner", end: 120000, accumulatedMs: 100000, points: [], summaryMeters: 500,
  workoutSet: { draftId: "draft", exerciseId: "run", orderIndex: 1, setNumber: 1, name: "Outdoor Run" },
} as unknown as Run;

test("a measured outdoor set joins its parent workout once, without sending route samples in the workout save", () => {
  const next = applyRecordedSet(draft, run);
  expect(next.exercises[0]).toBe(draft.exercises[0]);
  expect(applyRecordedSet(next, run)).toBe(next);
  expect(applyRecordedSet(draft, { ...run, owner: "other" })).toBe(draft);
  const payload = buildRpcPayloadFromDraft({ draft: next, clientSaveId: "draft" });
  expect(payload.exercise_history.map(ex => ex.exercise_id)).toEqual(["squat", "run"]);
  expect(payload.exercise_history[1].sets[0]).toMatchObject({ distance: 0.5, time_seconds: 100 });
  expect(JSON.stringify(payload)).not.toContain("recording");
});

test("outdoor cardio enters GPS while indoor cardio and outdoor strength use normal logging", () => {
  expect(isOutdoorCardio("Outdoor Walk", "Cardio")).toBe(true);
  expect(isOutdoorCardio("Cycle (Outdoor)", "cardio")).toBe(true);
  expect(isOutdoorCardio("Indoor Run", "cardio")).toBe(false);
  expect(isOutdoorCardio("Outdoor Press", "strength")).toBe(false);
});

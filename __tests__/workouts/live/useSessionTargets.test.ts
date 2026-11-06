import { AppState } from "react-native";
import { renderHook, waitFor } from "@testing-library/react-native";
import { loadGoalRoadmap } from "@/lib/plans/loadGoalRoadmap";
import { supabase } from "@/lib/supabase";
import { useSessionTargets } from "@/app/features/workouts/live/useSessionTargets";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";

jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/lib/plans/loadGoalRoadmap", () => ({
  loadGoalRoadmap: jest.fn(),
}));

const draft = {
  draftId: "d",
  userId: "owner",
  isPlanWorkout: true,
  planWorkoutId: "slot",
  workoutId: "upper-a",
  startedAt: "2026-11-06T10:00:00Z",
} as LiveWorkoutDraft;

test("Quick Start, cached snapshots and mismatched accounts skip target loading", () => {
  const update = jest.fn();
  renderHook(() =>
    useSessionTargets({ ...draft, isPlanWorkout: false }, "owner", update),
  );
  renderHook(() =>
    useSessionTargets({ ...draft, sessionTargets: {} }, "owner", update),
  );
  renderHook(() => useSessionTargets(draft, "other", update));
  expect(supabase.from).not.toHaveBeenCalled();
});

test("hydrates an older draft without replacing edits or touching a different draft", async () => {
  jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove: jest.fn() });
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: { plan_id: "plan" } }),
  };
  (supabase.from as jest.Mock).mockReturnValue(query);
  (loadGoalRoadmap as jest.Mock).mockResolvedValue({
    plan: { id: "plan", start_date: "2026-11-01", end_date: "2026-11-07" },
    workouts: [{ id: "slot", workout_id: "upper-a" }],
    exercises: [{ workout_id: "upper-a", exercise_id: "bench" }],
    goals: [
      {
        id: "goal",
        exercise_id: "bench",
        metrics: ["reps"],
        start_reps: 6,
        target_reps: 8,
      },
    ],
  });
  const update = jest.fn();
  renderHook(() => useSessionTargets(draft, "owner", update));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(query.eq).toHaveBeenCalledWith("plans.user_id", "owner");
  const merge = update.mock.calls[0][0];
  const edited = { ...draft, title: "Edited" };
  expect(merge(edited)).toEqual({
    ...edited,
    sessionTargets: { bench: [{ goalId: "goal", weight: null, reps: 8 }] },
  });
  const other = { ...draft, draftId: "another" };
  expect(merge(other)).toBe(other);
});

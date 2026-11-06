import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { supabase } from "@/lib/supabase";
import { useExerciseHistory } from "@/app/features/workouts/live/useExerciseHistory";
import type { LiveWorkoutDraft } from "@/app/features/workouts/live/state/types";

jest.mock("@/lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
beforeEach(() => {
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() });
});
const history = { completedAt: "2026-11-02", sets: [{ reps: 8, weight: 100 }] };
function draft() {
  return {
    draftId: "draft", userId: "alice", workoutId: "upper-a",
    exercises: [
      { exerciseId: "bench", workoutExerciseId: "template-row", sets: [] },
      { exerciseId: "row", workoutExerciseId: null, sets: [] },
      { exerciseId: "curl", workoutExerciseId: null, sets: [] },
    ],
  } as unknown as LiveWorkoutDraft;
}

test("batches additions separately from template rows and merges into the current draft", async () => {
  rpc.mockImplementation(async (_name, args) => ({
    data: args.p_exercise_ids.map((id: string) => ({ exercise_id: id, last_session: history })),
  }));
  const original = draft();
  const update = jest.fn();
  renderHook(() => useExerciseHistory(original, "alice", update));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls.map(call => call[1])).toEqual([
    { p_exercise_ids: ["bench"], p_preferred_workout_id: "upper-a", p_expected_user_id: "alice" },
    { p_exercise_ids: ["curl", "row"], p_preferred_workout_id: null, p_expected_user_id: "alice" },
  ]);
  const merge = update.mock.calls[0][0];
  const edited = draft();
  edited.exercises[0].sets = [{ reps: 7 }] as typeof edited.exercises[0]["sets"];
  edited.exercises[1].exerciseId = "replacement";
  const result = merge(edited);
  expect(result.exercises[0].sets).toBe(edited.exercises[0].sets);
  expect(result.exercises[0].lastSession).toEqual(history);
  expect(result.exercises[1]).toBe(edited.exercises[1]);
  expect(result.exercises[2].historyResolved).toBe(true);
  const other = { ...edited, userId: "other" };
  expect(merge(other)).toBe(other);
});

test("ignores an in-flight result after the active account changes", async () => {
  let finish!: (value: unknown) => void;
  rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const current = draft();
  current.exercises = current.exercises.slice(1);
  const update = jest.fn();
  const { rerender } = renderHook<void, { user: string }>(({ user }) => useExerciseHistory(current, user, update), {
    initialProps: { user: "alice" },
  });
  rerender({ user: "bob" });
  await act(async () => { finish({ data: [{ exercise_id: "row", last_session: history }] }); });
  expect(update).not.toHaveBeenCalled();
});

const {
  assertIsDisposableLocalDatabase,
  workoutPayload,
} = require("../../scripts/e2e/tester-workout-flow.cjs");

test.each([
  "https://cpzgnhchdpkxnebjsyyi.supabase.co",
  "https://example.supabase.co",
  "http://192.168.1.2:54321",
  "http://malicious.localhost.example:54321",
])("tester E2E refuses non-local database %s", (url) => {
  expect(() => assertIsDisposableLocalDatabase(url)).toThrow(/Refusing/);
});

test("tester E2E only accepts a disposable local endpoint", () => {
  expect(assertIsDisposableLocalDatabase("http://127.0.0.1:54321")).toBe(true);
  expect(assertIsDisposableLocalDatabase("http://localhost:54321")).toBe(true);
});

test("tester E2E uses a Quick Start payload with no plan side effects", () => {
  const payload = workoutPayload({
    clientSaveId: "a2000000-0000-4000-8000-000000000001",
    label: "test",
    exercises: [
      { id: "a1000000-0000-4000-8000-000000000001", sets: [{ reps: 5, weight: 100 }] },
      { id: "b1000000-0000-4000-8000-000000000002", sets: [{ time_seconds: 600, distance: 2 }] },
    ],
  });
  expect(payload.workout_id).toBeNull();
  expect(payload.plan_workout_id).toBeUndefined();
  expect(payload.workout_exercise_updates).toEqual([]);
  expect(payload.exercise_history).toHaveLength(2);
  expect(payload.exercise_history[1].sets[0]).toMatchObject({
    reps: null, weight: null, time_seconds: 600, distance: 2,
  });
});

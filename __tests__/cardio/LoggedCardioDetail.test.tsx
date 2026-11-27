import React from "react";
import { render } from "@testing-library/react-native";
import WorkoutHistoryDetailScreen from "@/app/features/history/screens/WorkoutHistoryDetailScreen";
import { LoggedCardioDetail } from "@/features/cardio/LoggedCardioDetail";

const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
jest.mock("@/features/cardio/RunHistoryDetail", () => ({ RunHistoryDetail: () => null }));
jest.mock("@/app/features/history/share/ShareWorkoutSheet", () => ({ ShareWorkoutSheet: () => null }));
jest.mock("@/lib/useAppTheme", () => ({ useAppTheme: () => ({ colors: {}, typography: { fontFamily: {} }, layout: { space: {} } }) }));
jest.mock("@/ui", () => {
  const { View, Text } = jest.requireActual("react-native");
  return { Card: View, Screen: View, LoadingScreen: () => null,
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text> };
});

test("a treadmill workout shows totals and distance-weighted pace along with the logged sets", () => {
  const view = render(<LoggedCardioDetail title="Treadmill Run" sets={[
    { set_number: 1, distance: 1, time_seconds: 360 },
    { set_number: 2, distance: 3, time_seconds: 900 },
  ]} />);
  for (const text of ["Treadmill Run", "4 km", "21:00", "5:15 /km", "Set 1", "Set 2"]) {
    expect(view.getByText(text)).toBeTruthy();
  }
  expect(view.queryByText("Kilometre splits")).toBeNull();
});

test("partial manual entries keep recorded values without inventing a total pace", () => {
  const view = render(<LoggedCardioDetail title="Outdoor Walk" sets={[
    { set_number: 1, distance: 2 }, { set_number: 2, time_seconds: 900 },
  ]} />);
  expect(view.getByText("2 km")).toBeTruthy();
  expect(view.getByText("15:00")).toBeTruthy();
  expect(view.queryByText("Average pace")).toBeNull();
});

test("mixed history opens Workout details with lifting sets and logged cardio in the same session", async () => {
  mockRpc.mockResolvedValue({ data: {
    header: { workout_history_id: "mixed", title: "Gym session", completed_at: "2026-11-27T12:00:00Z" },
    stats: { duration_seconds: 2400, sets_count: 2, distance_total: 3, volume_kg: 300 },
    exercises: [
      { exercise_id: "bench", exercise_name: "Bench Press", sets: [{ set_number: 1, weight_kg: 60, reps: 5 }] },
      { exercise_id: "treadmill", exercise_name: "Treadmill Run", sets: [{ set_number: 1, distance: 3, time_seconds: 900 }] },
    ],
  }, error: null });
  const view = render(<WorkoutHistoryDetailScreen workoutHistoryId="mixed" />);
  await view.findByText("Workout details");
  for (const text of ["Gym session", "40:00", "Bench Press", "60 kg × 5", "Treadmill Run", "15:00", "5:00 /km"]) {
    expect(view.getByText(text)).toBeTruthy();
  }
});

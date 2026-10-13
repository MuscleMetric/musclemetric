/* eslint-disable @typescript-eslint/no-require-imports -- Jest native screen stubs. */
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { supabase } from "@/lib/supabase";
import ReviewWorkoutScreen from "@/app/features/workouts/review/ReviewWorkoutScreen";
import { bootLiveDraft } from "@/app/features/workouts/live/boot/bootLiveDraft";
import { saveCompletedWorkoutFromLiveDraft } from "@/lib/saveWorkout";
import { buildEmptyQuickStartDraft } from "@/app/features/workouts/live/builders/buildEmptyQuickStartDraft";

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));
jest.mock("@/lib/authContext", () => ({
  useAuth: () => ({ userId: "user-a" }),
}));
jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: { bg: "#fff" },
    layout: { space: { lg: 16 } },
  }),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock("@/app/features/workouts/live/boot/bootLiveDraft", () => ({
  bootLiveDraft: jest.fn(),
}));
jest.mock("@/app/features/workouts/live/persist/local", () => ({
  clearLiveDraftForUser: jest.fn(),
}));
jest.mock("@/app/features/workouts/live/persist/server", () => ({
  clearServerDraft: jest.fn(),
}));
jest.mock("@/app/features/workouts/live/persist/mmLocal", () => ({
  clearAllMmLiveDraftKeysForUser: jest.fn(),
}));
jest.mock("@/app/features/workouts/live/persist/persistControl", () => ({
  pauseLivePersist: jest.fn(),
}));
jest.mock("@/lib/liveWorkout", () => ({ stopLiveWorkout: jest.fn() }));
jest.mock("@/lib/saveWorkout", () => ({
  saveCompletedWorkoutFromLiveDraft: jest.fn(),
  durationSecondsFromDraft: () => 60,
}));
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));
jest.mock("@/app/features/workouts/review/useReviewData", () => ({
  useReviewData: () => ({
    summary: { setsCompleted: 1, exercisesWithCompletedSets: 1 },
    issues: [],
    exercises: [],
  }),
}));
jest.mock("@/app/features/workouts/review/ui/ReviewHeader", () => ({
  ReviewHeader: () => null,
}));
jest.mock("@/app/features/workouts/review/ui/SummaryGrid", () => ({
  SummaryGrid: () => null,
}));
jest.mock("@/app/features/workouts/review/ui/ValidationCard", () => ({
  ValidationCard: () => null,
}));
jest.mock("@/app/features/workouts/review/ui/ExerciseReviewCard", () => ({
  ExerciseReviewCard: () => null,
}));
jest.mock("@/app/features/workouts/review/ui/SaveFooter", () => {
  const { Text, Pressable } = require("react-native");
  return {
    SaveFooter: ({ onPressSave }: { onPressSave: () => void }) => (
      <Pressable onPress={onPressSave}><Text>Save workout now</Text></Pressable>
    ),
  };
});
jest.mock("@/features/workoutShare/WorkoutSavedScreen", () => () => null);
jest.mock("@/ui", () => {
  const { Text } = require("react-native");
  return {
    LoadingScreen: () => <Text>Loading</Text>,
    ErrorState: () => <Text>Error</Text>,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (bootLiveDraft as jest.Mock).mockResolvedValue(
    buildEmptyQuickStartDraft({ userId: "user-a" }),
  );
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "user-a" } }, error: null,
  });
});

it("rejects confirmation after user changes while the Save Alert is open", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(<ReviewWorkoutScreen />);
  fireEvent.press(await screen.findByText("Save workout now"));

  const confirmation = alert.mock.calls.find(([title]) => title === "Save workout?");
  expect(confirmation).toBeDefined();

  // The screen/alert was mounted for A, but B is authenticated at tap time.
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "user-b" } }, error: null,
  });

  const save = confirmation?.[2]?.find((b) => b.text === "Save");
  expect(save?.onPress).toBeDefined();
  await act(async () => { await save?.onPress?.(); });

  expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  expect(saveCompletedWorkoutFromLiveDraft).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith(
    "Save failed",
    expect.stringContaining("account changed"),
  );
  alert.mockRestore();
});

it("rejects an interrupted sign-out before confirmation", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const screen = render(<ReviewWorkoutScreen />);
  fireEvent.press(await screen.findByText("Save workout now"));

  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: null }, error: null,
  });
  const confirmation = alert.mock.calls.find(([title]) => title === "Save workout?");
  const save = confirmation?.[2]?.find((b) => b.text === "Save");
  await act(async () => { await save?.onPress?.(); });

  expect(saveCompletedWorkoutFromLiveDraft).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith(
    "Save failed",
    expect.stringContaining("account changed"),
  );
  alert.mockRestore();
});

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { OutdoorSetScreen } from "@/features/cardio/OutdoorSetScreen";
import { pauseRecorder, finishRecorder } from "@/features/cardio/recorder";
import type { Run } from "@/features/cardio/runMetrics";

jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));
jest.mock("expo-live-activity", () => ({}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("@/features/cardio/recorder", () => ({ pauseRecorder: jest.fn(), finishRecorder: jest.fn() }));
jest.mock("@/features/cardio/runStore", () => ({}));
jest.mock("@/ui", () => {
  const { Text } = jest.requireActual("react-native");
  return { Button: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) =>
    <Text onPress={disabled ? undefined : onPress}>{title}</Text> };
});

test("shows recent GPS pace and logs the measured set back to the workout", async () => {
  const now = Date.now();
  const run = { owner: "owner", id: "run", activeSince: now - 300000, accumulatedMs: 0, leg: 1,
    workoutSet: { name: "Outdoor Run" }, points: [
      { time: now - 10000, leg: 1, meters: 475 }, { time: now, leg: 1, meters: 500 },
    ],
  } as Run;
  const view = render(<OutdoorSetScreen run={run} />);
  expect(view.getByLabelText("Current pace 6:40 min/km")).toBeTruthy();
  expect(view.getByLabelText("Distance 0.50 km")).toBeTruthy();
  fireEvent.press(view.getByText("Pause"));
  await waitFor(() => expect(pauseRecorder).toHaveBeenCalledWith("owner", "run"));
  view.rerender(<OutdoorSetScreen run={{ ...run, activeSince: null, accumulatedMs: 300000 }} />);
  expect(view.getByLabelText("Active time 5:00")).toBeTruthy();
  fireEvent.press(view.getByText("Finish exercise"));
  fireEvent.press(view.getByText("Easy"));
  fireEvent.press(view.getByText("Save set and return to workout"));
  await waitFor(() => expect(finishRecorder).toHaveBeenCalledWith("owner", "run", "easy", null));
});

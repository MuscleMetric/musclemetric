import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import OutdoorRun from "@/app/features/cardio/outdoor-run";
import { listRuns } from "@/features/cardio/runStore";
import { finishRecorder } from "@/features/cardio/recorder";
import { backupRoute } from "@/features/cardio/syncRun";
import type { Run } from "@/features/cardio/runMetrics";

jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
jest.mock("@/lib/authContext", () => ({ useAuth: () => ({ session: { user: { id: "a" } } }) }));
jest.mock("@/lib/useAppTheme", () => ({ useAppTheme: () => ({ colors: { text: "black", success: "green" } }) }));
jest.mock("@/ui", () => {
  const { View, Text, Pressable } = require("react-native");
  return { Screen: View, ScreenHeader: () => null, AuthRequiredState: () => null,
    Button: ({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) =>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}><Text>{title}</Text></Pressable> };
});
jest.mock("@/features/cardio/recorder", () => ({ finishRecorder: jest.fn(), RunActionError: class extends Error {} }));
jest.mock("@/features/cardio/runStore", () => ({ listRuns: jest.fn(), subscribeRuns: () => () => {} }));
jest.mock("@/features/cardio/syncRun", () => ({ backupRoute: jest.fn() }));
jest.mock("@/features/cardio/restoreRun", () => ({ restoreHistoryRun: jest.fn() }));
jest.mock("@/features/cardio/RouteMap", () => () => null);

test("requires a category, leaves effort optional, and reports a recoverable offline finish", async () => {
  const run: Run = { version: 1, autoBackup: true, id: "run", owner: "a", start: 0, end: null, activeSince: null, accumulatedMs: 10000,
    leg: 1, type: null, effort: null, historyId: null, routeSynced: false, rejected: 0,
    points: [{ latitude: 0, longitude: 0, accuracy: 5, time: 10000, activeMs: 10000, leg: 1, meters: 40 }] };
  jest.mocked(listRuns).mockResolvedValue([run]);
  jest.mocked(backupRoute).mockRejectedValue(Error("offline"));
  const view = render(<OutdoorRun />);
  const finish = await view.findByText("Finish and save run");
  fireEvent.press(finish);
  expect(finishRecorder).not.toHaveBeenCalled();
  fireEvent.press(view.getByText("Easy"));
  fireEvent.press(finish);
  await waitFor(() => expect(finishRecorder).toHaveBeenCalledWith("a", "run", "easy", null));
  await view.findByText("Run saved on this iPhone. Reconnect to sync.");
});

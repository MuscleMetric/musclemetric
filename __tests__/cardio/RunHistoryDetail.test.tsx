import React from "react";
import { render } from "@testing-library/react-native";
import { RunHistoryDetail } from "@/features/cardio/RunHistoryDetail";
import { listRuns } from "@/features/cardio/runStore";
import { restoreHistoryRun } from "@/features/cardio/restoreRun";
import type { Run } from "@/features/cardio/runMetrics";

jest.mock("@/lib/authContext", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
jest.mock("@/lib/useAppTheme", () => ({ useAppTheme: () => ({ colors: {}, typography: { fontFamily: { bold: "System" } } }) }));
jest.mock("@/ui", () => ({ Card: jest.requireActual("react-native").View }));
jest.mock("@/features/cardio/RouteMap", () => () => null);
jest.mock("@/features/cardio/syncRun", () => ({ backupRoute: jest.fn() }));
jest.mock("@/features/cardio/runStore", () => ({ listRuns: jest.fn() }));
jest.mock("@/features/cardio/restoreRun", () => ({ restoreHistoryRun: jest.fn() }));

const start = Date.now() - 1000000;
const run: Run = { version: 1, owner: "owner", id: "run", start, end: start + 720000,
  type: "easy", effort: 3, leg: 0, activeSince: null, accumulatedMs: 700000,
  rejected: 0, historyId: "history", routeSynced: true,
  points: [0, 1000, 2000, 2100].map((meters, i) => ({
    latitude: 0, longitude: 0, time: start + i * 300000, accuracy: 5, leg: 0,
    meters, activeMs: [0, 350000, 660000, 700000][i],
  })) };

test("history restores measured splits and compares full kilometres only", async () => {
  jest.mocked(listRuns).mockResolvedValue([]);
  jest.mocked(restoreHistoryRun).mockResolvedValue(run);
  const screen = render(<RunHistoryDetail historyId="history" completedAt={new Date(start).toISOString()} recorded />);
  await screen.findByText("Kilometre 2 · Fastest");
  expect(screen.getAllByText("5:10")).toHaveLength(1);
  expect(screen.getByText("Final 0.10 km")).toBeTruthy();
  expect(restoreHistoryRun).toHaveBeenCalledWith("owner", "history");
});

test("expired history displays the retained distance and pace without splits", async () => {
  const old = { ...run, start: start - 91 * 86400000, points: [], summaryMeters: 2100 };
  jest.mocked(listRuns).mockResolvedValue([old]);
  const screen = render(<RunHistoryDetail historyId="history" completedAt={new Date(old.start).toISOString()} recorded />);
  await screen.findByText("2.10 km");
  expect(screen.getByText("11:40")).toBeTruthy();
  expect(screen.getByText(/90-day route/)).toBeTruthy();
  expect(screen.queryByText("Kilometre splits")).toBeNull();
});

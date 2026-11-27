import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { RunInsights } from "@/features/cardio/RunInsights";
import { loadAnalyticsRuns, type AnalyticsRun } from "@/features/cardio/analyticsData";
import { DAY_MS } from "@/features/cardio/analyticsMetrics";

jest.mock("@/features/cardio/analyticsData", () => ({ loadAnalyticsRuns: jest.fn() }));
jest.mock("@/lib/useAppTheme", () => ({ useAppTheme: () => ({ colors: {} }) }));
jest.mock("@/ui", () => ({ Button: () => null }));

test("all filtered runs open their own workout, newest first, including runs beyond the fifth row", async () => {
  const runs = Array.from({ length: 7 }, (_, index): AnalyticsRun => {
    const start = Date.now() - (7 - index) * DAY_MS;
    return {
      version: 1, id: "run-" + index, owner: "tester", start, end: start + 300000,
      type: index === 1 ? "tempo" : "easy", accumulatedMs: 300000, activeSince: null,
      points: [], summaryMeters: 1000 + index * 100, leg: 0, rejected: 0, effort: null,
      historyId: "history-" + index, routeSynced: false, sourceLabel: "logged",
    };
  });
  jest.mocked(loadAnalyticsRuns).mockResolvedValue(runs);
  const open = jest.fn();
  const screen = render(<RunInsights runs={[]} owner="tester" open={open} />);
  const links = await screen.findAllByText("View workout details ›");
  expect(links).toHaveLength(7);
  fireEvent.press(links[0]);
  expect(open).toHaveBeenLastCalledWith("run-6", "history-6");
  fireEvent.press(links[6]);
  expect(open).toHaveBeenLastCalledWith("run-0", "history-0");
  fireEvent.press(screen.getByRole("button", { name: "Tempo" }));
  expect(screen.getAllByText("View workout details ›")).toHaveLength(1);
  fireEvent.press(screen.getByText("View workout details ›"));
  expect(open).toHaveBeenLastCalledWith("run-1", "history-1");
  fireEvent.press(screen.getByText("1 km"));
  expect(open).toHaveBeenLastCalledWith("run-0", "history-0");
});

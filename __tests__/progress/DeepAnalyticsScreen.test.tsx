/* eslint-disable @typescript-eslint/no-require-imports -- Jest React Native component stubs. */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { supabase } from "@/lib/supabase";
import DeepAnalytics from "@/app/features/progress/sections/DeepAnalytics";

jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({ colors: { textMuted: "#666" } }),
}));
jest.mock("@/ui", () => {
  const { Text, View } = require("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    LoadingScreen: () => <Text>Loading deep analytics</Text>,
    ErrorState: ({ title, message }: { title: string; message: string }) => (
      <Text>{title}: {message}</Text>
    ),
    Icon: () => null,
  };
});
jest.mock("@/app/features/progress/deep-analytics/utils/deepAnalyticsInsights", () => ({
  generatePrimaryInsight: jest.fn(() => null),
}));
jest.mock("@/app/features/progress/deep-analytics/components", () => {
  const { Text } = require("react-native");
  return {
    DeepAnalyticsHeader: () => <Text>Strength screen rendered</Text>,
    DeepAnalyticsStatCards: () => null,
    DeepAnalyticsInsightCard: () => null,
    DeepAnalyticsFormulaCard: () => null,
    StrengthOverTimeSection: () => null,
    VolumeTrendSection: () => null,
    WeightVsRepsSection: () => null,
    SetContributionSection: () => null,
  };
});
jest.mock("@/app/features/progress/deep-analytics/components/CardioAnalyticsView", () => {
  const { Text } = require("react-native");
  return {
    CardioAnalyticsView: ({
      name, data,
    }: {
      name: string;
      data: { session_count: number; total_distance_km: number; sessions: unknown[] };
    }) => (
      <Text>{name}: {data?.session_count ?? "MISSING"} sessions, {data?.total_distance_km ?? "MISSING"} km, {data?.sessions?.length ?? "MISSING"} trend points</Text>
    ),
  };
});

const cardioResponse = {
  meta: {
    exercise_type: "cardio",
    exercise_id: "run-id",
    exercise_name: "Outdoor Run",
    timezone: "Europe/London",
  },
  cardio: {
    session_count: 2,
    total_distance_km: 8.2,
    total_duration_seconds: 3000,
    longest_distance_km: 5,
    average_pace_seconds_per_km: 366,
    latest: null,
    sessions: [
      { session_id: "session-a", completed_at: "2026-10-20T00:00:00Z", distance_km: 5, duration_seconds: 1800, pace_seconds_per_km: 360 },
      { session_id: "session-b", completed_at: "2026-10-21T00:00:00Z", distance_km: 3.2, duration_seconds: 1200, pace_seconds_per_km: 375 },
    ],
  },
  charts: {},
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("loads cardio data with the exact RPC/argument and shows it instead of strength analytics", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: cardioResponse, error: null });
  const view = render(<DeepAnalytics exerciseId="run-id" />);
  await waitFor(() => {
    expect(view.getByText("Outdoor Run: 2 sessions, 8.2 km, 2 trend points")).toBeTruthy();
  });
  expect(supabase.rpc).toHaveBeenCalledWith("get_exercise_deep_analytics", { p_exercise_id: "run-id" });
  expect(view.queryByText("Strength screen rendered")).toBeNull();
});

it("shows an actionable error on a missing production analytics RPC", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "Could not find get_exercise_deep_analytics" },
  });
  const view = render(<DeepAnalytics exerciseId="run-id" />);
  expect(await view.findByText(
    "Deep analytics failed: Could not find get_exercise_deep_analytics",
  )).toBeTruthy();
});

it("retains the strength path and does not render the cardio view for strength exercises", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: { ...cardioResponse, meta: { ...cardioResponse.meta, exercise_type: "strength" } },
    error: null,
  });
  const view = render(<DeepAnalytics exerciseId="bench-id" />);
  expect(await view.findByText("Strength screen rendered")).toBeTruthy();
  expect(view.queryByText(/Outdoor Run:.*sessions/)).toBeNull();
});

it("does not send a request when exercise ID is missing", async () => {
  const view = render(<DeepAnalytics exerciseId="" />);
  expect(await view.findByText("Deep analytics failed: Missing exerciseId")).toBeTruthy();
  expect(supabase.rpc).not.toHaveBeenCalled();
});

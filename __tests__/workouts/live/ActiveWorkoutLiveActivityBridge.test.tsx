jest.mock("@/features/cardio/runStore", () => ({ currentRecorder: async () => null, subscribeRuns: () => () => {} }));
/**
 * ActiveWorkoutLiveActivityBridge.test.tsx
 *
 * What this file tests:
 * - passes the active live workout draft into useLiveActivitySync
 * - enables Live Activity syncing when an active workout exists
 * - disables Live Activity syncing when there is no active workout
 *
 * Notes:
 * - this is intentionally a very focused wiring test
 * - it protects the architectural change where Live Activity moved from
 *   LiveWorkoutScreen into app-level session scope
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { ActiveWorkoutLiveActivityBridge } from "@/app/features/workouts/live/session/ActiveWorkoutLiveActivityBridge";

const mockUseActiveWorkoutSession = jest.fn();
const mockUseLiveActivitySync = jest.fn();

jest.mock(
  "@/app/features/workouts/live/session/useActiveWorkoutSession",
  () => ({
    useActiveWorkoutSession: () => mockUseActiveWorkoutSession(),
  }),
);

jest.mock(
  "@/app/features/workouts/live/liveActivity/useLiveActivitySync",
  () => ({
    useLiveActivitySync: (...args: any[]) => mockUseLiveActivitySync(...args),
  }),
);

describe("ActiveWorkoutLiveActivityBridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("enables live activity sync when there is an active draft", () => {
    const draft = {
      draftId: "draft-1",
      userId: "user-1",
      title: "Push Day",
      workoutId: "workout-1",
      startedAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:05:00.000Z",
      timerElapsedSeconds: 100,
      timerLastActiveAt: null,
      ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
      exercises: [],
    };

    mockUseActiveWorkoutSession.mockReturnValue({
      activeDraft: draft,
      hasActiveWorkout: true,
      timerText: "01:40",
      elapsedSeconds: 100,
      loading: false,
      refresh: jest.fn(),
      clearSnapshot: jest.fn(),
      resumeWorkout: jest.fn(),
    });

    render(<ActiveWorkoutLiveActivityBridge />);

    expect(mockUseLiveActivitySync).toHaveBeenCalledWith(draft, true);
  });

  it("disables live activity sync when there is no active draft", () => {
    mockUseActiveWorkoutSession.mockReturnValue({
      activeDraft: null,
      hasActiveWorkout: false,
      timerText: "00:00",
      elapsedSeconds: 0,
      loading: false,
      refresh: jest.fn(),
      clearSnapshot: jest.fn(),
      resumeWorkout: jest.fn(),
    });

    render(<ActiveWorkoutLiveActivityBridge />);

    expect(mockUseLiveActivitySync).toHaveBeenCalledWith(null, false);
  });
});
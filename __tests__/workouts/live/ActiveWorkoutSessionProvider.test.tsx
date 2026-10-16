/**
 * ActiveWorkoutSessionProvider.test.tsx
 *
 * What this file tests:
 * - loads a persisted live workout draft for the signed-in user
 * - exposes active draft data through the session context
 * - derives timer text from persisted timer fields
 * - exposes no active workout when no persisted draft exists
 * - resumeWorkout routes back into the live workout
 * - refresh updates provider state
 *
 * Notes:
 * - AppState is mocked at module level because the provider subscribes to app foreground events
 * - timers are faked because the provider runs a 1-second interval for timer text
 * - the Live Activity bridge is mocked so this file focuses only on provider behavior
 */

import React from "react";
import { Text, AppState } from "react-native";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { ActiveWorkoutSessionProvider } from "@/app/features/workouts/live/session/ActiveWorkoutSessionProvider";
import { useActiveWorkoutSession } from "@/app/features/workouts/live/session/useActiveWorkoutSession";
import { isLiveDraftCompleted } from "@/lib/workoutSaveIdentity";

const mockLoadLiveDraftForUser = jest.fn();
const mockUsePathname = jest.fn();
const mockRouterPush = jest.fn();
const mockAppStateRemove = jest.fn();
const mockAddEventListener = jest.fn(() => ({
  remove: mockAppStateRemove,
}));

jest.mock("@/lib/workoutSaveIdentity", () => ({
  isLiveDraftCompleted: jest.fn(),
}));

jest.mock("@/lib/authContext", () => ({
  useAuth: () => ({
    session: {
      user: { id: "user-1" },
    },
  }),
}));

jest.mock("expo-router", () => ({
  usePathname: () => mockUsePathname(),
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
  },
}));

jest.mock("@/app/features/workouts/live/persist/local", () => ({
  loadLiveDraftForUser: (...args: any[]) => mockLoadLiveDraftForUser(...args),
}));

jest.mock(
  "@/app/features/workouts/live/session/ActiveWorkoutLiveActivityBridge",
  () => ({
    ActiveWorkoutLiveActivityBridge: () => null,
  }),
);

function Consumer() {
  const session = useActiveWorkoutSession();

  return (
    <>
      <Text testID="hasActiveWorkout">
        {session.hasActiveWorkout ? "yes" : "no"}
      </Text>
      <Text testID="timerText">{session.timerText}</Text>
      <Text testID="title">{session.activeDraft?.title ?? "none"}</Text>
      <Text testID="workoutId">{session.activeDraft?.workoutId ?? "none"}</Text>
      <Text testID="loading">{session.loading ? "yes" : "no"}</Text>
      <Text onPress={() => session.resumeWorkout()} testID="resumeTrigger">
        resume
      </Text>
      <Text onPress={() => session.refresh()} testID="refreshTrigger">
        refresh
      </Text>
    </>
  );
}

describe("ActiveWorkoutSessionProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isLiveDraftCompleted as jest.Mock).mockResolvedValue(false);
    jest.useFakeTimers();
    mockUsePathname.mockReturnValue("/(tabs)/workout");

    jest.spyOn(AppState, "addEventListener").mockImplementation(
      () =>
        ({
          remove: mockAppStateRemove,
        }) as any,
    );
  });

  afterEach(() => {
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("loads a persisted draft and exposes it through context", async () => {
    mockLoadLiveDraftForUser.mockResolvedValue({
      draftId: "draft-1",
      userId: "user-1",
      workoutId: "workout-1",
      planWorkoutId: null,
      title: "Leg Day",
      startedAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:05:00.000Z",
      timerElapsedSeconds: 125,
      timerLastActiveAt: null,
      ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
      exercises: [],
    });

    let screen: ReturnType<typeof render>;

    screen = render(
      <ActiveWorkoutSessionProvider>
        <Consumer />
      </ActiveWorkoutSessionProvider>,
    );

    await waitFor(() => {
      expect(screen!.getByTestId("hasActiveWorkout").props.children).toBe(
        "yes",
      );
    });

    expect(screen!.getByTestId("title").props.children).toBe("Leg Day");
    expect(screen!.getByTestId("workoutId").props.children).toBe("workout-1");
    expect(screen!.getByTestId("timerText").props.children).toBe("02:05");
  });

  it("does not offer a completed draft in the resume gate after cleanup fails", async () => {
    mockLoadLiveDraftForUser.mockResolvedValue({
      draftId: "completed-draft",
      userId: "user-1",
      title: "Previously saved",
      timerElapsedSeconds: 120,
    });
    (isLiveDraftCompleted as jest.Mock).mockResolvedValue(true);

    const screen = render(
      <ActiveWorkoutSessionProvider><Consumer /></ActiveWorkoutSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").props.children).toBe("no");
    });
    expect(screen.getByTestId("hasActiveWorkout").props.children).toBe("no");
    expect(screen.getByTestId("title").props.children).toBe("none");
  });

  it("exposes no active workout when no draft exists", async () => {
    mockLoadLiveDraftForUser.mockResolvedValue(null);

    let screen: ReturnType<typeof render>;

    screen = render(
      <ActiveWorkoutSessionProvider>
        <Consumer />
      </ActiveWorkoutSessionProvider>,
    );

    await waitFor(() => {
      expect(screen!.getByTestId("loading").props.children).toBe("no");
    });

    expect(screen!.getByTestId("hasActiveWorkout").props.children).toBe("no");
    expect(screen!.getByTestId("title").props.children).toBe("none");
    expect(screen!.getByTestId("timerText").props.children).toBe("00:00");
  });

  it("routes back into the live workout when resumeWorkout is called", async () => {
    mockLoadLiveDraftForUser.mockResolvedValue({
      draftId: "draft-2",
      userId: "user-1",
      workoutId: "workout-22",
      planWorkoutId: "plan-workout-9",
      title: "Push Day",
      startedAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:05:00.000Z",
      timerElapsedSeconds: 90,
      timerLastActiveAt: null,
      ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
      exercises: [],
    });

    let screen: ReturnType<typeof render>;

    screen = render(
      <ActiveWorkoutSessionProvider>
        <Consumer />
      </ActiveWorkoutSessionProvider>,
    );

    await waitFor(() => {
      expect(screen!.getByTestId("hasActiveWorkout").props.children).toBe(
        "yes",
      );
    });

    await act(async () => {
      fireEvent.press(screen!.getByTestId("resumeTrigger"));
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/features/workouts/live",
      params: {
        workoutId: "workout-22",
        planWorkoutId: "plan-workout-9",
      },
    });
  });

  it("can refresh and update provider state", async () => {
    mockLoadLiveDraftForUser.mockResolvedValueOnce(null).mockResolvedValueOnce({
      draftId: "draft-3",
      userId: "user-1",
      workoutId: "workout-3",
      planWorkoutId: null,
      title: "Upper Body",
      startedAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:05:00.000Z",
      timerElapsedSeconds: 45,
      timerLastActiveAt: null,
      ui: { activeExerciseIndex: 0, activeSetNumber: 1 },
      exercises: [],
    });

    let screen: ReturnType<typeof render>;

    screen = render(
      <ActiveWorkoutSessionProvider>
        <Consumer />
      </ActiveWorkoutSessionProvider>,
    );

    await waitFor(() => {
      expect(screen!.getByTestId("hasActiveWorkout").props.children).toBe("no");
    });

    await act(async () => {
      fireEvent.press(screen!.getByTestId("refreshTrigger"));
    });

    await waitFor(() => {
      expect(screen!.getByTestId("hasActiveWorkout").props.children).toBe(
        "yes",
      );
    });

    expect(screen!.getByTestId("title").props.children).toBe("Upper Body");
    expect(screen!.getByTestId("timerText").props.children).toBe("00:45");
  });
});

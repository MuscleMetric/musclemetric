import React from "react";
import { AccessibilityInfo, AppState, Pressable, Text } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ExerciseDemo } from "@/features/vitalPreview/ExerciseDemo";

const mockPlayer = {
  loop: false,
  muted: false,
  playing: false,
  status: "readyToPlay",
  audioMixingMode: "",
  currentTime: 0,
  playbackRate: 1,
  play: jest.fn(),
  pause: jest.fn(),
  replaceAsync: jest.fn(),
};
const mockClip = {
  exerciseId: "0054",
  name: "Squat",
  equipment: "barbell",
  target: "quads",
  source: 54,
  instructions: ["Example instruction"],
};
jest.mock("@/features/vitalPreview/catalog", () => ({
  findExerciseDemo: (id: string) => (id === "squat" ? mockClip : null),
}));
jest.mock("@/features/vitalPreview/DemoThumbnail", () => ({
  DemoThumbnail: () => null,
}));
jest.mock("expo-video", () => ({
  VideoView: () => null,
  useVideoPlayer: (_: unknown, setup: (p: unknown) => void) => {
    setup(mockPlayer);
    return mockPlayer;
  },
}));
jest.mock("expo", () => ({
  useEvent: (_: unknown, __: unknown, initial: unknown) => initial,
}));
jest.mock("lucide-react-native", () => ({
  Pause: () => null,
  Play: () => null,
  RotateCcw: () => null,
  X: () => null,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: { text: "#000", surface: "#fff", primary: "#2563EB" },
    typography: { fontFamily: { bold: "System", semibold: "System" } },
  }),
}));
beforeEach(() => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  mockPlayer.replaceAsync.mockResolvedValue(undefined);
  jest
    .spyOn(AppState, "addEventListener")
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof AppState.addEventListener
    >);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
});
it("opens and closes without triggering the parent selection action", async () => {
  const select = jest.fn();
  const stopPropagation = jest.fn();
  const screen = render(
    <Pressable onPress={select}>
      <Text>Existing set: 80 × 8</Text>
      <ExerciseDemo exerciseId="squat" name="Back Squat" />
    </Pressable>,
  );
  fireEvent.press(screen.getByLabelText("Watch Back Squat demonstration"), {
    stopPropagation,
  });
  expect(stopPropagation).toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
  await waitFor(() => expect(mockPlayer.replaceAsync).toHaveBeenCalledWith(54));
  expect(screen.getByText("How to perform")).toBeTruthy();
  fireEvent.press(screen.getByText("Back to exercise"));
  expect(screen.queryByText("How to perform")).toBeNull();
  expect(screen.getByText("Existing set: 80 × 8")).toBeTruthy();
});
it("does not render unavailable demos", () => {
  const screen = render(
    <ExerciseDemo exerciseId="unmapped" name="Private exercise" />,
  );
  expect(screen.queryByText("Watch demo")).toBeNull();
});
it("respects reduced motion and pauses on background", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  const listener = jest.spyOn(AppState, "addEventListener");
  const screen = render(<ExerciseDemo exerciseId="squat" name="Back Squat" />);
  fireEvent.press(screen.getByLabelText("Watch Back Squat demonstration"), {
    stopPropagation: jest.fn(),
  });
  await waitFor(() => expect(mockPlayer.replaceAsync).toHaveBeenCalled());
  expect(mockPlayer.play).not.toHaveBeenCalled();
  const callback = listener.mock.calls.find(
    ([event]) => event === "change",
  )?.[1];
  callback?.("background");
  expect(mockPlayer.pause).toHaveBeenCalled();
});
it("closes when its containing entry sheet closes", () => {
  const screen = render(
    <ExerciseDemo exerciseId="squat" name="Back Squat" enabled />,
  );
  fireEvent.press(screen.getByLabelText("Watch Back Squat demonstration"), {
    stopPropagation: jest.fn(),
  });
  screen.rerender(
    <ExerciseDemo exerciseId="squat" name="Back Squat" enabled={false} />,
  );
  expect(screen.queryByText("How to perform")).toBeNull();
});

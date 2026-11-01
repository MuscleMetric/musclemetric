/* eslint-disable @typescript-eslint/no-require-imports -- Native UI stubs for the modal navigation regression. */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import { CreateWorkoutModal } from "@/app/features/workouts/components/CreateWorkoutModal";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({
    colors: {
      overlay: "rgba(0,0,0,0.4)",
      surface: "#fff",
      border: "#ddd",
    },
    layout: {
      radius: { lg: 16 },
      space: { sm: 8, md: 16 },
    },
  }),
}));

jest.mock("@/ui", () => {
  const { Pressable, Text } = require("react-native");
  return {
    Button: ({
      title,
      onPress,
    }: {
      title: string;
      onPress: () => void;
    }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

it("starts an empty live workout from the shared create menu", () => {
  const onClose = jest.fn();
  const screen = render(
    <CreateWorkoutModal visible onClose={onClose} />,
  );

  fireEvent.press(screen.getByText("Quick start workout"));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith("/features/workouts/live");
});

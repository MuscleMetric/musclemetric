import React, { useState } from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ExercisePickerSheet } from "@/ui/modals/ExercisePickerSheet";
jest.mock("@/features/vitalPreview/catalog", () => ({
  findExerciseDemo: (id: string) => (id === "squat" ? { source: 54 } : null),
}));
jest.mock("@/features/vitalPreview/ExerciseDemo", () => ({
  ExerciseDemo: () => null,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0 }),
}));
jest.mock("@/lib/useAppTheme", () => ({
  useAppTheme: () => ({ colors: {}, typography: { fontFamily: {} } }),
}));
it("keeps selected exercises when filtering to demos and confirms both choices", () => {
  const confirm = jest.fn();
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <ExercisePickerSheet
        options={[
          {
            id: "squat",
            name: "Back Squat",
            type: "strength",
            equipment: "barbell",
          },
          {
            id: "bench",
            name: "Bench Press",
            type: "strength",
            equipment: "barbell",
          },
        ]}
        search=""
        onChangeSearch={jest.fn()}
        selectedIds={selected}
        onChangeSelectedIds={setSelected}
        onClose={jest.fn()}
        onConfirm={confirm}
        multiSelect
      />
    );
  }
  const screen = render(<Harness />);
  fireEvent.press(screen.getByText("Bench Press"));
  fireEvent.press(screen.getByText("With demos"));
  expect(screen.queryByText("Bench Press")).toBeNull();
  fireEvent.press(screen.getByText("Back Squat"));
  fireEvent.press(screen.getByText(/Confirm selection.*2/));
  expect(confirm).toHaveBeenCalledWith(["bench", "squat"]);
});

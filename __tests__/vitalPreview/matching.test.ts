import { matchExercise, normalizeName } from "@/features/vitalPreview/matching";

describe("Vital Animations safe preview matching", () => {
  it("normalizes common exercise name abbreviations", () => {
    expect(normalizeName("Incline DB Press")).toBe("incline dumbbell press");
  });
  it("matches an exact existing exercise without changing its ID", () => {
    expect(matchExercise({ name: "Barbell Bench Press", equipment: "barbell" }, [
      { id: "existing-uuid", name: "Barbell Bench Press", equipment: "barbell" },
    ])).toEqual({ status: "matched", exercise: { id: "existing-uuid", name: "Barbell Bench Press", equipment: "barbell" } });
  });
  it("does not guess at two ambiguous exercises", () => {
    expect(matchExercise({ name: "Hack Squat", equipment: "machine" }, [
      { id: "first", name: "Hack Squat", equipment: "machine" },
      { id: "second", name: "Hack Squat", equipment: "machine" },
    ])).toEqual({ status: "ambiguous" });
  });
  it("never links an unknown exercise", () => {
    expect(matchExercise({ name: "Unknown Lunge", equipment: "barbell" }, [])).toEqual({ status: "unmatched" });
  });
});

import {
  findExerciseDemo,
  SAMPLE_EXERCISE_IDS,
} from "@/features/vitalPreview/catalog";
import type { VitalPreviewAnimation } from "@/features/vitalPreview/types";
jest.mock("@/assets/vital-preview/manifest", () => ({
  PREVIEW_ANIMATIONS: [],
}));
const clip = (exerciseId: string, qualityNote?: string) =>
  ({ exerciseId, qualityNote, source: 1 }) as VitalPreviewAnimation;
it("only links installed samples to explicit catalogue IDs", () => {
  const squat = "ab0e8734-a4c0-497c-aeec-e3f6e60f7693";
  expect(findExerciseDemo(squat, [clip("0054")])?.exerciseId).toBe("0054");
  expect(findExerciseDemo(squat, [])).toBeNull();
  expect(findExerciseDemo("private-squat-id", [clip("0054")])).toBeNull();
  expect(findExerciseDemo(undefined, [clip("0054")])).toBeNull();
});
it("shares a rope demo between catalogue aliases without changing their IDs", () => {
  for (const id of [
    "e6b802ac-3668-4bac-9e59-970bf8fa7f47",
    "b589ce54-b3c8-4dc6-940c-5036dbaf0678",
  ]) {
    expect(findExerciseDemo(id, [clip("0085")])?.exerciseId).toBe("0085");
  }
});
it("excludes flagged samples and the mislabelled hip thrust from old manifests", () => {
  expect(Object.values(SAMPLE_EXERCISE_IDS)).not.toContain("0057");
  expect(
    findExerciseDemo("9aeb03bc-17cc-43f7-86eb-fe70b249952b", [clip("0057")]),
  ).toBeNull();
  expect(
    findExerciseDemo("ab0e8734-a4c0-497c-aeec-e3f6e60f7693", [
      clip("0054", "Review required"),
    ]),
  ).toBeNull();
});

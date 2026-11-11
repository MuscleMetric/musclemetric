import { PREVIEW_ANIMATIONS } from "@/assets/vital-preview/manifest";
import type { VitalPreviewAnimation } from "./types";

// Deliberate catalogue IDs, never fuzzy name matches (especially private exercises).
// 0057 is mislabeled hip thrust footage and is excluded even in older local ZIPs.
export const SAMPLE_EXERCISE_IDS: Record<string, string> = {
  "b8beee9a-0aee-4e5a-909f-9352e26bad82": "0051", // Pec deck
  "ab0e8734-a4c0-497c-aeec-e3f6e60f7693": "0054", // Back squat
  "2d2d40ad-948a-426b-8b45-cbf77f1701c2": "0060", // Barbell RDL
  "48a2c427-b79f-42da-b5f8-8017fd10d5fe": "0064", // Goblet squat
  "fab13bf9-8c1c-403d-8c4d-56575383d9c7": "0068", // Hack squat
  "e3308618-5897-4349-b911-49ed3f60f112": "0074", // Leg press
  "f2d7700a-a6ce-4c86-b4dc-a408477198b1": "0074", // 45-degree sled
  "e6b802ac-3668-4bac-9e59-970bf8fa7f47": "0085", // Rope pushdown
  "b589ce54-b3c8-4dc6-940c-5036dbaf0678": "0085", // Rope pushdown alias
  "458729ae-1045-46f0-8b1d-b014d98b282b": "0088", // Standing barbell press
  "d3af4654-c41b-48ab-8c83-d25cdad264d0": "0099", // Rear delt machine
};

export function findExerciseDemo(
  exerciseId: string | undefined,
  clips: VitalPreviewAnimation[] = PREVIEW_ANIMATIONS,
): VitalPreviewAnimation | null {
  const sampleId = exerciseId ? SAMPLE_EXERCISE_IDS[exerciseId] : undefined;
  return (
    clips.find(
      (c) =>
        c.exerciseId === sampleId && c.exerciseId !== "0057" && !c.qualityNote,
    ) ?? null
  );
}

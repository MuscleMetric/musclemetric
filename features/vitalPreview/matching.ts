import type { VitalPreviewAnimation } from "./types";

export type ExerciseRecord = { id: string; name: string; equipment: string | null };
export type MatchResult = {
  status: "matched" | "ambiguous" | "unmatched";
  exercise?: ExerciseRecord;
};

export function normalizeName(value: string): string {
  return value.toLowerCase()
    .replace(/\b(db|bb)\b/g, (token) => token === "db" ? "dumbbell" : "barbell")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Conservative matching: no write and no automatic replacement of exercise UUIDs.
export function matchExercise(
  sample: Pick<VitalPreviewAnimation, "name" | "equipment">,
  existing: ExerciseRecord[],
): MatchResult {
  const name = normalizeName(sample.name);
  const matches = existing.filter((row) => normalizeName(row.name) === name);
  if (matches.length === 1) return { status: "matched", exercise: matches[0] };
  if (matches.length > 1) {
    const equipment = normalizeName(sample.equipment);
    const filtered = matches.filter((row) => normalizeName(row.equipment ?? "") === equipment);
    if (filtered.length === 1) return { status: "matched", exercise: filtered[0] };
    return { status: "ambiguous" };
  }
  return { status: "unmatched" };
}

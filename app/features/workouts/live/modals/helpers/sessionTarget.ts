import type { StrengthTarget } from "@/lib/plans/goalRoadmap";
import { e1rm } from "./strengthMath";

type SetValues = { weight: number | null; reps: number | null };

export function targetLabel({ weight, reps }: SetValues) {
  const parts = [];
  if (weight != null) parts.push(`${weight} kg`);
  if (reps != null) parts.push(`${reps} ${reps === 1 ? "rep" : "reps"}`);
  return parts.join(" × ");
}

export function targetFeedback(
  target: StrengthTarget,
  sets: SetValues[],
  compareStrength: boolean,
) {
  const { weight, reps } = target;
  let best: SetValues | undefined;
  let highest = -Infinity;
  for (const set of sets) {
    if (weight != null && !(Number(set.weight) > 0)) continue;
    if (reps != null && !(Number(set.reps) > 0)) continue;
    const w = set.weight ?? 0;
    const r = set.reps ?? 0;
    if ((weight == null || w >= weight) && (reps == null || r >= reps))
      return "Target hit";
    const score =
      weight != null && reps != null ? e1rm(w, r) : weight != null ? w : r;
    if (score > highest) {
      best = set;
      highest = score;
    }
  }
  if (!best) return `Aim for ${targetLabel(target)}`;

  const weightGap = Math.max(
    0,
    Number(((weight ?? 0) - (best.weight ?? 0)).toFixed(2)),
  );
  const repGap = Math.max(0, (reps ?? 0) - (best.reps ?? 0));
  const gaps = [];
  if (weightGap) gaps.push(`${weightGap} kg`);
  if (repGap) gaps.push(`${repGap} ${repGap === 1 ? "rep" : "reps"}`);
  const gap = `${gaps.join(" and ")} short`;
  if (
    compareStrength &&
    weight &&
    reps &&
    ((best.weight ?? 0) > weight || (best.reps ?? 0) > reps)
  ) {
    const ratio = highest / e1rm(weight, reps);
    if (ratio > 1.03) return `Higher estimated strength · ${gap}`;
    if (ratio >= 0.97) return `Similar estimated strength · ${gap}`;
  }
  return gap;
}

import React from "react";
import { render } from "@testing-library/react-native";
import {
  sessionMetric,
  targetsForWorkout,
  type GoalRow,
} from "@/lib/plans/goalRoadmap";
import { targetFeedback } from "@/app/features/workouts/live/modals/helpers/sessionTarget";
import { StrengthStatsCards } from "@/app/features/workouts/live/modals/sections/StrengthStatsCards";

const target = { goalId: "bench-goal", weight: 100, reps: 8 };
const check = (weight: number | null, reps: number | null) =>
  targetFeedback(target, [{ weight, reps }], true);

test.each([
  [null, null, "Aim for 100 kg × 8 reps"],
  [100, null, "Aim for 100 kg × 8 reps"],
  [100, 7, "1 rep short"],
  [97.5, 8, "2.5 kg short"],
  [100, 8, "Target hit"],
  [105, 7, "Similar estimated strength · 1 rep short"],
  [95, 6, "5 kg and 2 reps short"],
] as const)("compares the actual set %s × %s", (weight, reps, expected) => {
  expect(check(weight, reps)).toBe(expected);
});
test("one qualifying set wins even when a different set has a higher e1RM", () => {
  expect(
    targetFeedback(
      target,
      [
        { weight: 110, reps: 7 },
        { weight: 100, reps: 8 },
      ],
      true,
    ),
  ).toBe("Target hit");
  expect(
    targetFeedback(
      target,
      [
        { weight: 105, reps: 7 },
        { weight: 95, reps: 8 },
      ],
      true,
    ),
  ).not.toBe("Target hit");
});
test("single-metric targets compare only the prescribed metric", () => {
  expect(
    targetFeedback(
      { ...target, weight: null },
      [{ weight: null, reps: 7 }],
      false,
    ),
  ).toBe("1 rep short");
  expect(
    targetFeedback(
      { ...target, reps: null },
      [{ weight: 102.5, reps: null }],
      true,
    ),
  ).toBe("Target hit");
});

test("live target matches the roadmap slot and skips unrelated exercises and slots", () => {
  const goal = {
    id: "g",
    exercise_id: "bench",
    metrics: ["weight", "reps"],
    start_weight: 90,
    target_weight: 105,
    start_reps: 6,
    target_reps: 9,
  } as GoalRow;
  const data = {
    plan: {
      id: "p",
      title: "Plan",
      start_date: "2026-11-02",
      end_date: "2026-11-15",
    },
    goals: [goal],
    workouts: ["a", "b", "c"].map((id, i) => ({
      id,
      workout_id: id,
      order_index: i,
      title: id,
    })),
    exercises: ["a", "c"].map((workout_id) => ({
      workout_id,
      exercise_id: "bench",
      order_index: 0,
    })),
  };
  expect(targetsForWorkout(data, "a", "2026-11-09T12:00:00Z")).toEqual({
    bench: [
      {
        goalId: "g",
        weight: sessionMetric(goal, "weight", 3, 4),
        reps: sessionMetric(goal, "reps", 3, 4),
      },
    ],
  });
  expect(
    targetsForWorkout(data, "a", "2026-11-09T12:00:00Z").bench[0],
  ).toMatchObject({ weight: 100, reps: 8 });
  expect(targetsForWorkout(data, "b", "2026-11-09T12:00:00Z")).toEqual({});
});

test("the live card updates after an edit and restores the historical card without a target", () => {
  const props = {
    colors: {},
    typography: { size: { sub: 12 }, fontFamily: {} },
    sessionVolume: 0,
    bestNow: null,
    volDelta: null,
    prDelta: null,
    bestE1rm6m: 125,
    showVolume: true,
    compareStrength: true,
  };
  const card = render(
    <StrengthStatsCards {...props} targets={[target]} sets={[]} />,
  );
  expect(card.getByText("Today’s target")).toBeTruthy();
  expect(card.getByText("100 kg × 8 reps")).toBeTruthy();
  card.rerender(
    <StrengthStatsCards
      {...props}
      targets={[target]}
      sets={[{ weight: 100, reps: 8 }]}
    />,
  );
  expect(card.getByText("Target hit")).toBeTruthy();
  card.rerender(
    <StrengthStatsCards
      {...props}
      targets={[target]}
      sets={[{ weight: 100, reps: 7 }]}
    />,
  );
  expect(card.getByText("1 rep short")).toBeTruthy();
  card.rerender(<StrengthStatsCards {...props} targets={[]} sets={[]} />);
  expect(card.getByText("Best (6 mo)")).toBeTruthy();
  expect(card.queryByText("Today’s target")).toBeNull();
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { stages, finiteNumber, exact, near, SCENARIOS, EXTRA } =
  require("../../scripts/e2e/production-known-history.cjs");

describe("production E2E three-stage fixture safety", () => {
  it("has separate setup, validation and cleanup stages", () => {
    expect(typeof stages.setup).toBe("function");
    expect(typeof stages.test).toBe("function");
    expect(typeof stages.cleanup).toBe("function");
  });

  it("keeps expected arithmetic completely independent from RPC calculations", () => {
    expect(SCENARIOS.map(s => s.name)).toEqual(["strength", "cardio", "mixed"]);
    expect(SCENARIOS.reduce((n, x) => n + x.volume, 0)).toBe(1215);
    expect(SCENARIOS.reduce((n, x) => n + x.distance, 0)).toBeCloseTo(8.2);
    expect(EXTRA.name).toBe("extra-cardio");
    expect(EXTRA.exercises[0].sets[0].distance).toBe(2);
  });

  it("rejects empty, missing and non-finite response metrics", () => {
    for (const value of [null, undefined, "", NaN, Infinity, "not-a-number"]) {
      expect(() => finiteNumber(value, "metric")).toThrow();
    }
    expect(finiteNumber("1215", "volume")).toBe(1215);
  });

  it("fails on a numerically wrong RPC payload instead of accepting HTTP success", () => {
    expect(() => exact(1214, 1215, "Strength volume")).toThrow("Strength volume");
    expect(() => near(7.5, 8.2, "Cardio km", 0.01)).toThrow("Cardio km");
    expect(() => near(8.20001, 8.2, "Cardio km", 0.01)).not.toThrow();
  });
});

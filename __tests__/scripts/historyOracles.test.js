const { num, equalsNum } = require("../../scripts/e2e/verify-history-oracles.cjs");

describe("exact test-history oracles", () => {
  test("rejects missing numeric values rather than silently converting null to zero", () => {
    expect(() => equalsNum(null, 0, "Cardio volume")).toThrow("must not be null");
    expect(() => equalsNum(undefined, 0, "Cardio volume")).toThrow("must not be undefined");
    expect(() => equalsNum("", 0, "Cardio volume")).toThrow("must not be empty");
    expect(() => equalsNum("invalid", 0, "Cardio volume")).toThrow("must be finite");
  });

  test("rejects a wrong value even when the backend returns a successful response", () => {
    expect(() => equalsNum(1214, 1215, "Training volume")).toThrow("Training volume");
    expect(() => equalsNum(2, 3, "Workout count")).toThrow("Workout count");
    expect(() => equalsNum("0", 0, "Empty training history")).not.toThrow();
    expect(num("1215", "Training volume")).toBe(1215);
  });
});

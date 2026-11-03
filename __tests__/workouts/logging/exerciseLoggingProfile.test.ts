import {
  getLoggingType,
  getExerciseLoggingProfile,
  hasCompletedSet,
} from "@/app/features/workouts/logging/exerciseLoggingProfile";

describe("exerciseLoggingProfile", () => {
  describe("getLoggingType", () => {
    it("detects plank as timed weighted", () => {
      expect(
        getLoggingType({
          name: "Plank",
          type: "strength",
        }),
      ).toBe("timed_weighted");
    });

    it("detects dead hang as timed weighted", () => {
      expect(
        getLoggingType({
          name: "Dead Hang",
        }),
      ).toBe("timed_weighted");
    });

    it("detects running as cardio", () => {
      expect(
        getLoggingType({
          name: "Running",
          type: "cardio",
        }),
      ).toBe("cardio");
    });

    it("detects push-up as bodyweight", () => {
      expect(
        getLoggingType({
          name: "Push-Up",
          equipment: "Bodyweight",
        }),
      ).toBe("bodyweight_weighted");
    });

    it("detects assisted pull-up as assisted", () => {
      expect(
        getLoggingType({
          name: "Assisted Pull-Up",
        }),
      ).toBe("assisted");
    });

    it.each([
      ["Cable Crunch", "cable"],
      ["Cable Crunch (Rope)", "cable"],
      ["Cable Crunch", null],
      ["Machine Ab Crunch", "machine"],
    ])("logs %s with %s equipment as strength", (name, equipment) => {
      expect(
        getLoggingType({ name, type: "strength", equipment }),
      ).toBe("strength");
    });

    it("keeps unweighted crunches as bodyweight", () => {
      expect(
        getLoggingType({ name: "Crunch", equipment: "bodyweight" }),
      ).toBe("bodyweight_weighted");
      expect(getLoggingType({ name: "Crunch" })).toBe("bodyweight");
    });

    it("defaults bench press to strength", () => {
      expect(
        getLoggingType({
          name: "Bench Press",
          type: "strength",
        }),
      ).toBe("strength");
    });
  });

  it("allows weight and reps for cable crunches", () => {
    const profile = getExerciseLoggingProfile({
      name: "Cable Crunch",
      equipment: "cable",
      type: "strength",
    });

    expect(profile.loggingType).toBe("strength");
    expect(profile.supportsWeight).toBe(true);
    expect(profile.supportsReps).toBe(true);
    expect(profile.supportsTime).toBe(false);
    expect(profile.canComputeVolume).toBe(true);
    expect(hasCompletedSet(profile, { weight: 30, reps: 12 })).toBe(true);
  });

  describe("hasCompletedSet", () => {
    it("accepts timed sets", () => {
      const profile = getExerciseLoggingProfile({
        name: "Plank",
      });

      expect(
        hasCompletedSet(profile, {
          timeSeconds: 60,
        }),
      ).toBe(true);
    });

    it("accepts bodyweight rep sets", () => {
      const profile = getExerciseLoggingProfile({
        name: "Push-Up",
        equipment: "Bodyweight",
      });

      expect(
        hasCompletedSet(profile, {
          reps: 15,
        }),
      ).toBe(true);
    });

    it("accepts cardio distance-only sets", () => {
      const profile = getExerciseLoggingProfile({
        name: "Running",
        type: "cardio",
      });

      expect(
        hasCompletedSet(profile, {
          distance: 5,
        }),
      ).toBe(true);
    });

    it("rejects empty sets", () => {
      const profile = getExerciseLoggingProfile({
        name: "Bench Press",
      });

      expect(hasCompletedSet(profile, {})).toBe(false);
    });
  });
});

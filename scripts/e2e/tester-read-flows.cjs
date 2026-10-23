"use strict";

// Read-only smoke tests for high-traffic app data endpoints. These run with the
// same real authenticated local tester JWT AFTER saving workouts and a plan.
const assert = require("node:assert/strict");

async function verifyTesterReadFlows({ userClient, planWorkoutId, workoutId }) {
  const endpoints = [
    ["get_home_summary", { p_month_offset: 0 }],
    ["get_progress_overview", undefined],
    ["get_workouts_tab_payload", undefined],
    ["get_profile_overview", undefined],
    ["get_settings_overview", undefined],
    ["get_exercise_picker_data", { p_include_private: true }],
    ["get_workout_session_bootstrap", {
      p_workout_id: workoutId, p_plan_workout_id: planWorkoutId,
    }],
  ];
  for (const [name, args] of endpoints) {
    const result = await userClient.rpc(name, args);
    if (result.error) {
      throw new Error(name + " authenticated read failed: " +
        result.error.code + ": " + result.error.message);
    }
    assert.ok(result.data !== null && result.data !== undefined,
      name + " returned empty/null instead of screen data");
    console.log("PASS " + name + " read with authenticated tester");
  }

  // Settings modals used this RPC but it was missing from both local/production.
  // Validate only whitelisted settings can be updated, and unrelated JSON stays.
  const experience = await userClient.rpc("set_profile_settings_v1", {
    p_key: "level", p_value: "advanced",
  });
  assert.ifError(experience.error);
  assert.equal(experience.data?.level, "advanced");
  const goal = await userClient.rpc("set_profile_settings_v1", {
    p_key: "primaryGoal", p_value: "improve_endurance",
  });
  assert.ifError(goal.error);
  assert.equal(goal.data?.level, "advanced", "Settings update must preserve other keys");
  assert.equal(goal.data?.primaryGoal, "improve_endurance");
  const invalid = await userClient.rpc("set_profile_settings_v1", {
    p_key: "role", p_value: "admin",
  });
  assert.ok(invalid.error, "Arbitrary settings keys must not be accepted");
  const settings = await userClient.rpc("get_settings_overview");
  assert.ifError(settings.error);
  const row = Array.isArray(settings.data) ? settings.data[0] : settings.data;
  assert.equal(row?.experience_level, "advanced");
  assert.equal(row?.primary_goal, "improve_endurance");
  console.log("PASS experience/primary goal settings updates and arbitrary key rejection");
}
module.exports = { verifyTesterReadFlows };

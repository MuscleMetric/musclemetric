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
}
module.exports = { verifyTesterReadFlows };

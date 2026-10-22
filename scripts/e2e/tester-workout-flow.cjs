#!/usr/bin/env node
"use strict";

// Real HTTP/Auth/PostgREST E2E for the workout flow.
// This script intentionally REFUSES to run against non-loopback Supabase.
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY;

function assertIsDisposableLocalDatabase(apiUrl) {
  if (!apiUrl) throw new Error("API_URL is required.");
  const parsed = new URL(apiUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("Refusing to write E2E workouts to a non-local Supabase database.");
  }
  if (parsed.protocol !== "http:") {
    throw new Error("E2E runner requires the disposable local HTTP Supabase API.");
  }
  return true;
}

function expectData(result, action) {
  if (result.error) throw new Error(action + ": " + result.error.message + " (" + result.error.code + ")");
  return result.data;
}

function workoutPayload({ clientSaveId, label, exercises }) {
  return {
    client_save_id: clientSaveId,
    workout_id: null, // Quick Start: no persistent template or plan touched
    completed_at: new Date().toISOString(),
    duration_seconds: 2999,
    notes: "AUTOMATED_E2E_FIXTURE " + label,
    exercise_history: exercises.map((exercise, order) => ({
      exercise_id: exercise.id,
      order_index: order,
      notes: "",
      workout_exercise_id: "",
      is_dropset: false,
      superset_group: "",
      superset_index: "",
      sets: exercise.sets.map((set, index) => ({
        set_number: index + 1,
        drop_index: 0,
        reps: null,
        weight: null,
        time_seconds: null,
        distance: null,
        notes: null,
        ...set,
      })),
    })),
    workout_exercise_updates: [],
  };
}

function getExercise(detail, exerciseId) {
  return detail.exercises.find((e) => e.exercise_id === exerciseId);
}

async function main() {
  assertIsDisposableLocalDatabase(url);
  if (!anonKey || !serviceKey) throw new Error("Local ANON_KEY and SERVICE_ROLE_KEY are required.");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = "tester-e2e-" + randomUUID() + "@example.invalid";
  const password = "Testing-" + randomBytes(24).toString("base64url") + "!9";
  const created = expectData(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "Provision isolated tester auth user",
  );
  const userId = created.user.id;

  // Some environments create profiles via auth triggers; others do not.
  const profile = expectData(
    await admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
    "Check tester profile",
  );
  if (!profile) {
    expectData(await admin.from("profiles").insert({ id: userId, name: "E2E Tester", email }),
      "Create tester profile");
  }

  const signIn = expectData(await userClient.auth.signInWithPassword({ email, password }), "Tester sign in");
  assert.equal(signIn.user.id, userId, "JWT subject must match provisioned tester");

  expectData(await userClient.rpc("set_username_v1", { p_username: "tester" }), "Set tester username");
  const confirmedProfile = expectData(
    await userClient.from("profiles").select("id,username").eq("id", userId).single(),
    "Verify tester user profile",
  );
  assert.equal(confirmedProfile.username, "tester");

  // Seed only this disposable local DB; exercise IDs are not production data.
  const ids = [randomUUID(), randomUUID()];
  const rows = [
    { id: ids[0], name: "E2E Strength Exercise", equipment: "Barbell", type: "strength", is_public: true },
    { id: ids[1], name: "E2E Outdoor Run", equipment: "Bodyweight", type: "cardio", is_public: true },
  ];
  expectData(await admin.from("exercises").insert(rows), "Seed local strength and cardio exercises");

  const scenarios = [
    {
      name: "strength",
      exercises: [
        { id: ids[0], sets: [{ reps: 5, weight: 100 }, { reps: 3, weight: 105 }] },
      ],
      count: 2, volume: 815, distance: 0,
    },
    {
      name: "cardio",
      exercises: [
        { id: ids[1], sets: [{ time_seconds: 1800, distance: 5 }] },
      ],
      count: 1, volume: 0, distance: 5,
    },
    {
      name: "mixed",
      exercises: [
        { id: ids[0], sets: [{ reps: 8, weight: 50 }] },
        { id: ids[1], sets: [{ time_seconds: 1200, distance: 3.2 }] },
      ],
      count: 2, volume: 400, distance: 3.2,
    },
  ];

  for (const scenario of scenarios) {
    const clientSaveId = randomUUID();
    const payload = workoutPayload({ clientSaveId, label: scenario.name, exercises: scenario.exercises });
    const args = { p_workout: payload, p_expected_user_id: userId };
    const id = expectData(await userClient.rpc("save_completed_workout_v2", args),
      scenario.name + ": authenticated save");
    assert.match(id, /^[\da-f]{8}-[\da-f-]{27,}$/i, "Saved workout must have an ID");

    const retryId = expectData(await userClient.rpc("save_completed_workout_v2", args),
      scenario.name + ": idempotent retry");
    assert.equal(retryId, id, "Retry must not create a second workout");

    const detail = expectData(await userClient.rpc("get_workout_history_detail", {
      p_workout_history_id: id,
    }), scenario.name + ": history detail");
    assert.equal(detail.header.workout_history_id, id);
    assert.equal(Number(detail.stats.duration_seconds), 2999);
    assert.equal(Number(detail.stats.sets_count), scenario.count);
    assert.equal(Number(detail.stats.volume_kg), scenario.volume);
    assert.equal(Number(detail.stats.distance_total), scenario.distance);
    assert.equal(detail.exercises.length, scenario.exercises.length);

    for (const exercise of scenario.exercises) {
      const actual = getExercise(detail, exercise.id);
      assert.ok(actual, scenario.name + ": exercise missing from history");
      assert.equal(actual.sets.length, exercise.sets.length);
      exercise.sets.forEach((expected, i) => {
        const got = actual.sets[i];
        if (expected.reps != null) assert.equal(Number(got.reps), expected.reps);
        if (expected.weight != null) assert.equal(Number(got.weight_kg), expected.weight);
        if (expected.time_seconds != null) assert.equal(Number(got.time_seconds), expected.time_seconds);
        if (expected.distance != null) assert.equal(Number(got.distance), expected.distance);
      });
    }

    const feed = expectData(await userClient.rpc("get_workout_history_feed", {
      p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
    }), scenario.name + ": history feed");
    const matches = feed.items.filter((item) => item.workout_history_id === id);
    assert.equal(matches.length, 1, "Saved workout must appear exactly once in history feed");
    assert.equal(Number(matches[0].volume_kg), scenario.volume);
    if (scenario.name !== "cardio") {
      assert.ok(Number(matches[0].sets_count) >= 1, "Strength sets missing from history feed");
    }

    console.log("PASS " + scenario.name + " -> authenticated save, retry, history detail and feed");
  }

  const incorrectOwner = expectData(await userClient.rpc("save_completed_workout_v2", {
    p_workout: workoutPayload({
      clientSaveId: randomUUID(), label: "ownership_reject",
      exercises: [{ id: ids[0], sets: [{ reps: 1, weight: 1 }] }],
    }),
    p_expected_user_id: randomUUID(),
  }).then(({ data, error }) => ({ data: { data, error }, error: null })), "Owner rejection response");
  assert.equal(incorrectOwner.data, null, "Cross-user save must not succeed");
  assert.equal(incorrectOwner.error.code, "42501", "Cross-user save must return permission denial");
  console.log("PASS cross-owner workout rejection");
  console.log("PASS real Supabase HTTP/Auth/PostgREST tester E2E");
  // No cleanup is needed: the entire local DB is discarded with the CI runner.
}

if (require.main === module) {
  main().catch((e) => { console.error("E2E FAILED:", e.message); process.exitCode = 1; });
}

module.exports = { assertIsDisposableLocalDatabase, workoutPayload };

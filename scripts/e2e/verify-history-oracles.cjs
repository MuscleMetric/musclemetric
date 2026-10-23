"use strict";

/**
 * Known-data acceptance tests: verify SQL/RPC outputs against independent
 * fixture arithmetic, then inspect the underlying database tables. LOCAL ONLY.
 * Nothing from this module is imported by live production tester automation.
 */
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
function assertIsDisposableLocalDatabase(apiUrl) {
  const endpoint = new URL(apiUrl);
  if (endpoint.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("History oracles refuse to run against non-local Supabase.");
  }
}

function read(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message + " (" + result.error.code + ")");
  return result.data;
}

function num(value, label) {
  assert.notEqual(value, null, label + " must not be null");
  assert.notEqual(value, undefined, label + " must not be undefined");
  assert.notEqual(value, "", label + " must not be empty");
  assert.ok(typeof value === "number" || typeof value === "string", label + " must be numeric");
  const n = Number(value);
  assert.ok(Number.isFinite(n), label + " must be finite: " + String(value));
  return n;
}

function equalsNum(value, expected, label) {
  assert.equal(num(value, label), expected, label);
}

async function verifyEmptyHistory({ userClient }) {
  const progress = read(await userClient.rpc("get_progress_overview"), "Empty user progress");
  equalsNum(progress.meta?.workouts_total, 0, "Empty user progress total");
  equalsNum(progress.momentum?.workouts_30d, 0, "Empty user 30d workouts");
  equalsNum(progress.momentum?.volume_30d, 0, "Empty user volume");
  const home = read(await userClient.rpc("get_home_summary", { p_month_offset: 0 }), "Empty user home");
  equalsNum(home.user?.workouts_total, 0, "Empty user home total");
  assert.equal(home.home_variant, "new_user");
  const feed = read(await userClient.rpc("get_workout_history_feed", {
    p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
  }), "Empty user history");
  assert.deepEqual(feed.items, [], "Fresh test user must start with empty workout history");
  console.log("PASS oracle: fresh account has zero history/volume and empty feed");
}

async function verifyDeterministicHistory({ url, anonKey, admin, userClient, userId, saved, exerciseIds }) {
  assertIsDisposableLocalDatabase(url);
  assert.equal(saved.length, 3, "Expected three fixed reference scenarios");
  const sessions = new Map(saved.map(({ name, id }) => [name, id]));
  assert.equal(sessions.size, 3);

  // Independent query through local-only admin client. This must not just
  // compare one RPC against another RPC that might share the same bad logic.
  const history = read(await admin.from("workout_history")
    .select("id,user_id,client_save_id").eq("user_id", userId), "Verify actual stored workout rows");
  assert.equal(history.length, 3, "Exactly three completed sessions persisted");
  assert.deepEqual(history.map(x => x.id).sort(), [...sessions.values()].sort());
  assert.ok(history.every(x => x.user_id === userId && x.client_save_id));

  const exerciseHistory = read(await admin.from("workout_exercise_history")
    .select("id,workout_history_id,exercise_id")
    .in("workout_history_id", [...sessions.values()]), "Verify stored exercise history");
  assert.equal(exerciseHistory.length, 4, "One strength, one cardio and two mixed exercise rows");
  const exerciseLookup = new Map(exerciseHistory.map(x => [x.id, x]));
  assert.deepEqual(
    exerciseHistory.map(x => x.exercise_id).sort(),
    [exerciseIds[0], exerciseIds[0], exerciseIds[1], exerciseIds[1]].sort(),
  );

  const sets = read(await admin.from("workout_set_history")
    .select("workout_exercise_history_id,reps,weight,distance,time_seconds")
    .in("workout_exercise_history_id", [...exerciseLookup.keys()]),
  "Verify stored individual sets");
  assert.equal(sets.length, 5, "Exactly five sets across three sessions");
  let calculatedVolume = 0;
  let calculatedDistance = 0;
  let calculatedCardioSeconds = 0;
  for (const set of sets) {
    const owner = exerciseLookup.get(set.workout_exercise_history_id);
    assert.ok(owner, "Set must belong to a known fixture exercise");
    if (owner.exercise_id === exerciseIds[0]) {
      calculatedVolume += num(set.reps, "strength reps") * num(set.weight, "strength weight");
      assert.equal(set.distance, null, "Strength set must not masquerade as cardio");
    } else {
      calculatedDistance += num(set.distance, "cardio distance");
      calculatedCardioSeconds += num(set.time_seconds, "cardio seconds");
      assert.equal(set.weight, null, "Cardio set must not masquerade as strength");
    }
  }
  equalsNum(calculatedVolume, 1215, "DB-calculated volume (815+400)");
  assert.ok(Math.abs(calculatedDistance - 8.2) < 1e-9, "DB-calculated cardio distance");
  equalsNum(calculatedCardioSeconds, 3000, "DB-calculated cardio duration");
  console.log("PASS oracle: 3 stored workouts / 4 exercise rows / 5 sets / 1215 kg / 8.2 km / 3000 seconds");

  const progress = read(await userClient.rpc("get_progress_overview"), "Read progress overview");
  assert.equal(progress.meta?.user_id, userId, "Progress must be scoped to current user");
  equalsNum(progress.meta?.workouts_total, 3, "Progress lifetime workouts");
  equalsNum(progress.momentum?.workouts_30d, 3, "Progress 30-day workouts");
  equalsNum(progress.momentum?.volume_30d, 1215, "Progress 30-day volume");
  equalsNum(progress.momentum?.workouts_prev_30d, 0, "No workouts in previous 30d");
  equalsNum(progress.momentum?.volume_prev_30d, 0, "No volume in previous 30d");
  assert.equal(progress.momentum?.unit, "kg");
  assert.equal(progress.consistency?.period, "month");
  const thisMonth = progress.consistency?.months?.at(-1);
  assert.ok(thisMonth, "Current-month consistency row must be present");
  equalsNum(thisMonth.workouts_completed, 3, "Current month workout count");
  assert.ok(Array.isArray(progress.recent_activity?.last_workouts),
    "Recent activity must be a list");
  assert.deepEqual(
    progress.recent_activity.last_workouts.map(x => x.workout_history_id).sort(),
    [...sessions.values()].sort(),
    "Progress recent activity must reference the three real workouts",
  );
  console.log("PASS oracle: progress totals/month/momentum/volume/recent activity");

  const home = read(await userClient.rpc("get_home_summary", { p_month_offset: 0 }),
    "Read home summary");
  equalsNum(home.user?.workouts_total, 3, "Home lifetime workouts");
  assert.equal(home.home_variant, "new_user", "Three workouts are below the five-workout threshold");
  assert.ok(Array.isArray(home.cards), "Home cards must be an array");
  const newUserProgress = home.cards.find(x => x.type === "new_user_progress");
  assert.ok(newUserProgress, "Three-workout account must show onboarding progress");
  equalsNum(newUserProgress.completed, 3, "Home onboarding progress");
  equalsNum(newUserProgress.target, 5, "Home onboarding progress threshold");
  console.log("PASS oracle: home cards and workout totals");

  const feed = read(await userClient.rpc("get_workout_history_feed", {
    p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
  }), "Read complete history feed");
  assert.equal(feed.items.length, 3, "Full workout history feed count");
  assert.deepEqual(feed.items.map(x => x.workout_history_id).sort(), [...sessions.values()].sort());
  const volumes = Object.fromEntries(saved.map(({ name, id }) => [
    id, name === "strength" ? 815 : name === "mixed" ? 400 : 0,
  ]));
  for (const item of feed.items) {
    equalsNum(item.volume_kg, volumes[item.workout_history_id],
      "History feed " + item.workout_history_id + " volume");
  }
  console.log("PASS oracle: every history feed row points to a real fixture with exact lifting totals");

  const analytics = read(await userClient.rpc("get_exercise_deep_analytics", {
    p_exercise_id: exerciseIds[1],
  }), "Read cardio trend and pace");
  equalsNum(analytics.cardio?.session_count, 2, "Cardio session count");
  equalsNum(analytics.cardio?.total_distance_km, 8.2, "Cardio cumulative distance");
  equalsNum(analytics.cardio?.total_duration_seconds, 3000, "Cardio total time");
  assert.ok(Math.abs(num(analytics.cardio?.average_pace_seconds_per_km, "Weighted pace") - 3000 / 8.2) < 1,
    "Weighted pace must reflect summed time divided by distance");
  console.log("PASS oracle: cardio deep analytics weighted pace and totals");

  // Second genuinely authenticated identity, not merely a forged UUID.
  // This tests row isolation end-to-end through PostgREST and RLS.
  const secondEmail = "e2e-isolation-" + randomUUID() + "@example.invalid";
  const secondPassword = "Testing-" + randomBytes(24).toString("base64url") + "!8";
  const secondUser = read(await admin.auth.admin.createUser({
    email: secondEmail, password: secondPassword, email_confirm: true,
  }), "Create second local auth identity").user;
  assert.notEqual(secondUser.id, userId);
  const secondClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  read(await secondClient.auth.signInWithPassword({
    email: secondEmail, password: secondPassword,
  }), "Authenticate independent user");
  const foreignRows = read(await secondClient.from("workout_history").select("id")
    .in("id", [...sessions.values()]), "Cross-account history query");
  assert.deepEqual(foreignRows, [], "Another user must see zero fixture history rows");
  const foreignFeed = read(await secondClient.rpc("get_workout_history_feed", {
    p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
  }), "Cross-account RPC feed");
  assert.deepEqual(foreignFeed.items, [], "Another user must have an empty workout feed");
  const foreignDetail = await secondClient.rpc("get_workout_history_detail", {
    p_workout_history_id: sessions.get("strength"),
  });
  assert.ok(
    foreignDetail.error ||
      !foreignDetail.data?.header ||
      foreignDetail.data.header.workout_history_id !== sessions.get("strength"),
    "Another user must not read a private workout via detail RPC",
  );
  console.log("PASS oracle: independently authenticated user cannot read another user's history");
}

module.exports = { verifyEmptyHistory, verifyDeterministicHistory, num, equalsNum };

#!/usr/bin/env node
"use strict";

/**
 * Three-stage REAL-PRODUCTION smoke/integration test.
 *
 * setup: verify a completely empty tester training/social state, record a
 * durable manifest, seed three workouts through the app's authenticated RPC.
 * test: assert exact response/data values; create a private post, interact
 * with it, create/edit a plan and save another workout; verify failure cases.
 * cleanup: run regardless of failures; delete ONLY rows bearing this run's
 * unique owner/marker/ID; verify the account returns to its baseline.
 *
 * No service-role credential, SQL migration or privileged admin endpoint.
 * Never use this to "reset" general accounts.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { sourceConstant } = require("../verify-production-workout-rpc.cjs");
const { workoutPayload } = require("./tester-workout-flow.cjs");
const { verifyAuthenticatedRpcCatalogue } = require("./verify-app-rpc-contract.cjs");
const { verifyTesterPlanFlow } = require("./tester-plan-flow.cjs");

const EXPECTED_HOST = "cpzgnhchdpkxnebjsyyi.supabase.co";
const EXPECTED_TESTER_ID = "d36d46e6-b8db-4675-843f-262e7141db00";
const MANIFEST = path.resolve(process.env.MM_E2E_STATE_FILE ||
  "ci-artifacts/production-known-history-state.json");
const COUNTS = ["workout_history", "posts", "plans", "goals"];
const SCENARIOS = [
  { name: "strength", volume: 815, distance: 0, sets: 2,
    exercises: [{ kind: "strength", sets: [{ reps: 5, weight: 100 }, { reps: 3, weight: 105 }] }] },
  { name: "cardio", volume: 0, distance: 5, sets: 1,
    exercises: [{ kind: "cardio", sets: [{ time_seconds: 1800, distance: 5 }] }] },
  { name: "mixed", volume: 400, distance: 3.2, sets: 2,
    exercises: [
      { kind: "strength", sets: [{ reps: 8, weight: 50 }] },
      { kind: "cardio", sets: [{ time_seconds: 1200, distance: 3.2 }] },
    ] },
];
const EXTRA = { name: "extra-cardio", volume: 0, distance: 2, sets: 1,
  exercises: [{ kind: "cardio", sets: [{ time_seconds: 600, distance: 2 }] }] };

function unwrap(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message + " [" + result.error.code + "]");
  return result.data;
}
function finiteNumber(value, label) {
  assert.ok(value !== null && value !== undefined && value !== "", label + " is missing");
  const number = Number(value);
  assert.ok(Number.isFinite(number), label + " must be a number");
  return number;
}
function exact(value, expected, label) {
  assert.equal(finiteNumber(value, label), expected, label);
}
function near(value, expected, label, epsilon = 0.001) {
  assert.ok(Math.abs(finiteNumber(value, label) - expected) <= epsilon, label +
    ": expected " + expected + ", got " + value);
}
function assertMarker(s, state) {
  assert.ok(typeof s === "string" && s.startsWith(state.marker),
    "Found data without this run's marker; refusing destructive action");
}
function persist(state) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(state, null, 2), { mode: 0o600 });
}
function load() {
  if (!fs.existsSync(MANIFEST)) return null;
  const state = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  assert.equal(state.userId, EXPECTED_TESTER_ID, "Manifest owner mismatch");
  assert.match(state.runId, /^[0-9a-f-]{36}$/i, "Malformed run marker");
  assert.equal(state.marker, "AUTOMATED_E2E_FIXTURE " + state.runId);
  return state;
}
async function connect() {
  const email = process.env.E2E_TESTER_EMAIL;
  const password = process.env.E2E_TESTER_PASSWORD;
  assert.ok(email && password, "Repository E2E tester secrets are missing");
  const app = fs.readFileSync(path.join(__dirname, "../../lib/supabase.ts"), "utf8");
  const url = sourceConstant(app, "SUPABASE_URL");
  const anonKey = sourceConstant(app, "SUPABASE_ANON_KEY");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "https:", "Production must be HTTPS");
  assert.equal(parsed.hostname, EXPECTED_HOST, "Production project identity mismatch");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = unwrap(await client.auth.signInWithPassword({ email, password }), "Authenticate tester");
  assert.equal(session.user.id, EXPECTED_TESTER_ID, "Never run against another account");
  const profile = unwrap(await client.from("profiles")
    .select("id,username,active_plan_id,weekly_workout_goal,settings")
    .eq("id", session.user.id).single(), "Read tester profile");
  assert.equal(profile.username?.toLowerCase(), "tester", "Unexpected profile username");
  return { client, session, profile, userId: session.user.id, url, anonKey };
}
async function count(client, table, userId) {
  const result = await client.from(table).select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (result.error) throw new Error("Count " + table + ": " + result.error.message);
  assert.ok(Number.isInteger(result.count), "Missing count for " + table);
  return result.count;
}
async function counts(client, userId) {
  const out = {};
  for (const table of COUNTS) out[table] = await count(client, table, userId);
  return out;
}
async function notificationCount(client, userId) {
  const result = await client.from("notifications")
    .select("id", { count: "exact", head: true }).eq("recipient_id", userId);
  if (result.error) throw new Error("Read notifications: " + result.error.message);
  assert.ok(Number.isInteger(result.count), "Missing notification count");
  return result.count;
}
async function existingWorkoutIds(client, userId) {
  const rows = unwrap(await client.from("workouts").select("id").eq("user_id", userId),
    "List tester templates");
  return rows.map(row => row.id).sort();
}
function scenarioPayload(scenario, state, clientSaveId, completedAt) {
  return {
    ...workoutPayload({
      clientSaveId,
      label: state.runId + "-" + scenario.name,
      exercises: scenario.exercises.map(exercise => ({
        id: state.exerciseIds[exercise.kind], sets: exercise.sets,
      })),
    }),
    completed_at: completedAt,
  };
}
async function saveFixture(client, state, scenario) {
  const clientSaveId = crypto.randomUUID();
  const record = { name: scenario.name, clientSaveId,
    completedAt: new Date().toISOString(),
    notes: state.marker + "-" + scenario.name, historyId: null };
  state.workouts.push(record);
  persist(state); // Persist BEFORE the RPC: cleanup can find a committed but unacknowledged write.
  const args = { p_workout: scenarioPayload(scenario, state, clientSaveId, record.completedAt),
    p_expected_user_id: state.userId };
  record.historyId = unwrap(await client.rpc("save_completed_workout_v2", args),
    "Save " + scenario.name);
  persist(state);
  return record;
}
async function resolveWorkouts(client, state) {
  const ids = state.workouts.map(x => x.clientSaveId);
  if (!ids.length) return [];
  const rows = unwrap(await client.from("workout_history")
    .select("id,user_id,client_save_id,notes")
    .eq("user_id", state.userId).in("client_save_id", ids), "Locate marked workouts");
  for (const row of rows) {
    const fixture = state.workouts.find(x => x.clientSaveId === row.client_save_id);
    assert.ok(fixture, "Unknown client save ID");
    assert.equal(row.notes, fixture.notes, "Workout marker mismatch");
    if (fixture.historyId) assert.equal(row.id, fixture.historyId, "Workout history ID drift");
    fixture.historyId = row.id;
  }
  return rows;
}
async function setup() {
  // Never overwrite an incomplete previous manifest.
  assert.ok(!fs.existsSync(MANIFEST), "Existing manifest found; run cleanup first");
  const { client, session, userId, profile, url, anonKey } = await connect();
  try {
    const baseline = await counts(client, userId);
    assert.deepEqual(baseline, {
      workout_history: 0, posts: 0, plans: 0, goals: 0,
    }, "Tester account is not empty; refuse to touch or delete existing records");
    assert.equal(profile.active_plan_id, null, "Preexisting active plan; refusing test");

    const catalogue = await verifyAuthenticatedRpcCatalogue({
      url, anonKey, accessToken: session.session.access_token,
      productionReadOnly: true,
    });
    const progress = unwrap(await client.rpc("get_progress_overview"), "Empty progress");
    exact(progress.meta?.workouts_total, 0, "Empty progress count");
    const strength = unwrap(await client.from("exercises")
      .select("id").eq("is_public", true).eq("type", "strength")
      .order("id").limit(1), "Find a real strength exercise");
    const cardio = unwrap(await client.from("exercises")
      .select("id").eq("is_public", true).eq("type", "cardio")
      .order("id").limit(1), "Find a real cardio exercise");
    assert.ok(strength[0]?.id && cardio[0]?.id, "Both exercise types are required");

    const runId = crypto.randomUUID();
    const state = {
      runId, marker: "AUTOMATED_E2E_FIXTURE " + runId, userId,
      baseline: { ...baseline, active_plan_id: profile.active_plan_id,
        weekly_workout_goal: profile.weekly_workout_goal,
        settings: profile.settings, existingWorkoutIds: await existingWorkoutIds(client,userId),
        notificationCount: await notificationCount(client,userId) },
      exerciseIds: { strength: strength[0].id, cardio: cardio[0].id },
      workouts: [], posts: [], planId: null,
    };
    persist(state);
    console.log("PRODUCTION E2E RUN ID: " + runId + " (non-secret cleanup identifier)");
    for (const scenario of SCENARIOS) await saveFixture(client, state, scenario);
    console.log("PASS SETUP: 3 real production workouts seeded, " +
      catalogue.verified + " static RPC routes visible");
  } finally {
    await client.auth.signOut();
  }
}
async function verifyHistory(client, state, expected = { workouts: 3, volume: 1215,
  distance: 8.2, seconds: 3000, cardioSessions: 2 }) {
  const rows = await resolveWorkouts(client, state);
  assert.equal(rows.length, expected.workouts, "Exact persisted workout count");
  const exerciseRows = unwrap(await client.from("workout_exercise_history")
    .select("id,exercise_id,workout_history_id").in("workout_history_id",
      rows.map(x => x.id)), "Load real exercise history rows");
  const setRows = unwrap(await client.from("workout_set_history")
    .select("workout_exercise_history_id,reps,weight,distance,time_seconds")
    .in("workout_exercise_history_id", exerciseRows.map(x => x.id)),
  "Load real set rows");
  const byId = new Map(exerciseRows.map(x => [x.id, x]));
  let volume = 0, distance = 0, seconds = 0;
  for (const row of setRows) {
    const exercise = byId.get(row.workout_exercise_history_id);
    assert.ok(exercise, "Missing exercise for set");
    if (exercise.exercise_id === state.exerciseIds.strength) {
      volume += finiteNumber(row.weight, "Set weight") * finiteNumber(row.reps, "Set reps");
    } else if (exercise.exercise_id === state.exerciseIds.cardio) {
      distance += finiteNumber(row.distance, "Set distance");
      seconds += finiteNumber(row.time_seconds, "Set seconds");
    } else throw Error("Unexpected exercise used by test");
  }
  exact(volume, expected.volume, "Stored lifting volume");
  near(distance, expected.distance, "Stored distance");
  exact(seconds, expected.seconds, "Stored cardio time");

  const progress = unwrap(await client.rpc("get_progress_overview"), "Read real progress");
  assert.equal(progress.meta?.user_id, state.userId, "Progress user");
  exact(progress.meta?.workouts_total, expected.workouts, "Progress workouts");
  exact(progress.momentum?.workouts_30d, expected.workouts, "30d workouts");
  exact(progress.momentum?.volume_30d, expected.volume, "30d strength volume");
  const currentMonth = progress.consistency?.months?.at(-1);
  assert.ok(currentMonth, "Missing monthly progress series");
  exact(currentMonth.workouts_completed, expected.workouts, "Monthly workout count");

  const home = unwrap(await client.rpc("get_home_summary", { p_month_offset: 0 }),
    "Read real home summary");
  exact(home.user?.workouts_total, expected.workouts, "Home workout count");
  assert.equal(home.home_variant, "new_user");
  const welcome = home.cards?.find(x => x.type === "new_user_progress");
  exact(welcome?.completed, expected.workouts, "Home milestone progress");
  exact(welcome?.target, 5, "Home milestone threshold");

  const feed = unwrap(await client.rpc("get_workout_history_feed", {
    p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
  }), "Read real recent activity");
  assert.equal(feed.items.length, expected.workouts, "Exact workout history feed length");
  assert.deepEqual(feed.items.map(x => x.workout_history_id).sort(),
    rows.map(x => x.id).sort(), "Recent activity must contain all known workouts once");
  const analytics = unwrap(await client.rpc("get_exercise_deep_analytics", {
    p_exercise_id: state.exerciseIds.cardio,
  }), "Read real cardio deep analytics");
  assert.equal(analytics.meta?.exercise_type, "cardio");
  exact(analytics.cardio?.session_count, expected.cardioSessions, "Cardio session count");
  near(analytics.cardio?.total_distance_km, expected.distance, "Cardio total distance");
  exact(analytics.cardio?.total_duration_seconds, expected.seconds, "Cardio total time");
  near(analytics.cardio?.average_pace_seconds_per_km,
    expected.seconds / expected.distance, "Weighted cardio pace", 1);
  console.log("PASS TESTS: " + expected.workouts + " sessions, " + expected.volume +
    " kg, " + expected.distance + " km, " + expected.seconds + " seconds; backend/UI APIs consistent");
}
async function verifyBadOwner(client, state) {
  const id = crypto.randomUUID();
  const bad = await client.rpc("save_completed_workout_v2", {
    p_workout: workoutPayload({
      clientSaveId: id, label: state.runId + "-REJECT",
      exercises: [{ id: state.exerciseIds.strength, sets: [{ reps: 1, weight: 1 }] }],
    }),
    p_expected_user_id: crypto.randomUUID(),
  });
  assert.equal(bad.data, null, "Cross-user save unexpectedly succeeded");
  assert.equal(bad.error?.code, "42501", "Cross-user save error code");
  const stored = unwrap(await client.from("workout_history")
    .select("id").eq("client_save_id", id), "Check rejected save had zero side effects");
  assert.equal(stored.length, 0);
  console.log("PASS TESTS: forged owner rejected and nothing persisted");
}
async function verifyPrivatePost(client, state, workoutId) {
  const caption = state.marker + " private-workout-post";
  // Caption is also a recoverable marker if the RPC committed but lost response.
  const args = {
    p_caption: caption, p_exercise_id: null, p_post_type: "workout",
    p_pr_reps: null, p_pr_weight: null, p_visibility: "private",
    p_workout_history_id: workoutId,
  };
  state.posts.push({ caption, postId: null });
  persist(state);
  const postId = unwrap(await client.rpc("create_post_v2", args), "Create private workout post");
  state.posts.at(-1).postId = postId;
  persist(state);
  const row = unwrap(await client.from("posts")
    .select("id,user_id,visibility,workout_history_id,workout_snapshot")
    .eq("id", postId).single(), "Read persisted private post");
  assert.equal(row.user_id, state.userId);
  assert.equal(row.visibility, "private");
  assert.equal(row.workout_history_id, workoutId);
  exact(row.workout_snapshot?.volume_kg, 815, "Private workout post lifting snapshot");
  const detail = unwrap(await client.rpc("get_post_detail_v1", {
    p_post_id: postId,
  }), "Read private post detail");
  assert.equal(detail.length, 1);
  assert.equal(detail[0].post_id, postId);
  const comment = state.marker + " test-comment";
  const made = unwrap(await client.rpc("add_post_comment", {
    p_post_id: postId, p_body: comment,
  }), "Comment on own private test post");
  assert.ok(made, "Comment RPC failed");
  const comments = unwrap(await client.rpc("get_post_comments", {
    p_post_id: postId, p_limit: 20,
  }), "Read private post comments");
  assert.ok(comments.some(x => x.body === comment), "Posted comment not readable");
  const liked = unwrap(await client.rpc("toggle_post_like", { p_post_id: postId }),
    "Like private post");
  assert.equal(liked[0]?.liked, true);
  const unliked = unwrap(await client.rpc("toggle_post_like", { p_post_id: postId }),
    "Undo private post like");
  assert.equal(unliked[0]?.liked, false);
  const posts = unwrap(await client.rpc("get_user_posts_v1", {
    p_user_id: state.userId, p_limit: 20, p_cursor_created_at: null, p_cursor_id: null,
  }), "Read tester's own social posts");
  assert.ok(posts.some(x => x.post_id === postId), "Test post missing from own posts");
  const foreign = await client.rpc("create_post_v2", { ...args,
    p_workout_history_id: crypto.randomUUID(), p_caption: state.marker + " invalid-post" });
  assert.ok(foreign.error, "Nonexistent workout must not produce a post");
  const unexpected = unwrap(await client.from("posts").select("id")
    .eq("user_id", state.userId).eq("caption", state.marker + " invalid-post"),
    "Verify invalid post was not saved");
  assert.equal(unexpected.length, 0);
  console.log("PASS TESTS: private workout post, snapshot, detail, comment, like/unlike and invalid post");
}
async function verifyReadEndpoints(client, fixture) {
  const endpoints = [
    ["get_home_summary", { p_month_offset: 0 }],
    ["get_progress_overview", undefined],
    ["get_workouts_tab_payload", undefined],
    ["get_profile_overview", undefined],
    ["get_settings_overview", undefined],
    ["get_exercise_picker_data", { p_include_private: true }],
    ["get_workout_session_bootstrap", {
      p_workout_id: fixture.workoutId, p_plan_workout_id: fixture.planWorkoutId,
    }],
  ];
  for (const [name, args] of endpoints) {
    const data = unwrap(await client.rpc(name, args), "Production screen API " + name);
    assert.ok(data !== null && data !== undefined, name + " must provide screen data");
  }
  console.log("PASS TESTS: seven production home/progress/profile/settings/plan screen data APIs");
}
async function tests() {
  const state = load();
  assert.ok(state, "Setup manifest not found");
  const { client, userId } = await connect();
  try {
    assert.equal(userId, state.userId);
    await verifyHistory(client, state);
    for (const scenario of SCENARIOS) {
      const row = state.workouts.find(x => x.name === scenario.name);
      const args = {
        p_workout: scenarioPayload(scenario, state, row.clientSaveId, row.completedAt),
        p_expected_user_id: userId,
      };
      const second = unwrap(await client.rpc("save_completed_workout_v2", args),
        "Idempotent " + scenario.name + " retry");
      assert.equal(second, row.historyId, "Idempotence must preserve workout identity");
      const detail = unwrap(await client.rpc("get_workout_history_detail", {
        p_workout_history_id: row.historyId,
      }), "History detail " + scenario.name);
      exact(detail.stats?.volume_kg, scenario.volume, "Details " + scenario.name + " volume");
      near(detail.stats?.distance_total, scenario.distance,
        "Details " + scenario.name + " distance");
      exact(detail.stats?.sets_count, scenario.sets, "Details " + scenario.name + " sets");
    }
    await verifyBadOwner(client, state);
    await verifyPrivatePost(client, state, state.workouts[0].historyId);
    await saveFixture(client, state, EXTRA);
    await verifyHistory(client, state, { workouts: 4, volume: 1215,
      distance: 10.2, seconds: 3600, cardioSessions: 3 });
    state.planStarted = true;
    persist(state);
    const plan = await verifyTesterPlanFlow({
      userClient: client, userId,
      exerciseIds: [state.exerciseIds.strength, state.exerciseIds.cardio],
      runLabel: state.runId,
    });
    state.planId = plan.planId;
    persist(state);
    await verifyReadEndpoints(client, plan);
    console.log("PASS TESTS: plan create/edit/goal, read APIs, exact production data and failures");
  } finally {
    await client.auth.signOut();
  }
}
async function deleteExact(client, table, predicate, label) {
  let query = client.from(table).delete().eq("id", predicate.id);
  for (const [k, v] of Object.entries(predicate)) {
    if (k !== "id") query = query.eq(k, v);
  }
  const removed = unwrap(await query.select("id"), "Cleanup " + label);
  assert.equal(removed.length, 1, "Cleanup must remove exactly one " + label);
}
async function cleanup() {
  const state = load();
  if (!state) {
    console.log("CLEANUP: No manifest; setup wrote nothing (or never started)");
    return;
  }
  const { client } = await connect();
  const failures = [];
  const attempt = async (name, action) => {
    try {
      await action();
    } catch (error) {
      failures.push(name + ": " + error.message);
      console.error("CLEANUP STEP FAILED (" + name + "): " + error.message);
    }
  };
  try {
    // Each category runs independently so a bad post does not prevent workout
    // cleanup. A failed category still fails the job and retains the manifest.
    await attempt("private posts", async () => {
      for (const entry of state.posts) {
        const rows = unwrap(await client.from("posts")
          .select("id,user_id,caption,visibility")
          .eq("user_id", state.userId).eq("caption", entry.caption),
        "Find only run-tagged posts");
        for (const row of rows) {
          assertMarker(row.caption, state);
          assert.equal(row.visibility, "private", "Unexpected public post; skip deletion");
          await deleteExact(client, "posts", {
            id: row.id, user_id: state.userId,
            caption: row.caption, visibility: "private",
          }, "private post");
        }
      }
    });

    await attempt("restore active plan", async () => {
      const profile = unwrap(await client.from("profiles")
        .select("active_plan_id").eq("id",state.userId).single(),"Read active plan");
      const plans = unwrap(await client.from("plans")
        .select("id,user_id,title").eq("user_id", state.userId)
        .eq("title", "AUTOMATED_E2E_PLAN_" + state.runId), "Find run-tagged plans");
      if (profile.active_plan_id) {
        assert.ok(plans.some(x => x.id === profile.active_plan_id),
          "Active plan is not this run's plan; do not overwrite it");
        const changed = unwrap(await client.from("profiles")
          .update({ active_plan_id: state.baseline.active_plan_id })
          .eq("id", state.userId).eq("active_plan_id", profile.active_plan_id)
          .select("id"), "Restore tester active plan");
        assert.equal(changed.length, 1);
      }
    });

    await attempt("run-tagged workout templates", async () => {
      const tag = " [E2E_" + state.runId + "]";
      const clones = unwrap(await client.from("workouts")
        .select("id,user_id,title,created_source")
        .eq("user_id", state.userId).eq("created_source", "plan_clone")
        .like("title", "%" + tag), "Find only run-tagged plan clones");
      for (const clone of clones) {
        assert.ok(clone.title.endsWith(tag), "Unexpected workout title; skip deletion");
        await deleteExact(client, "workouts", {
          id: clone.id, user_id: state.userId, created_source: "plan_clone",
        }, "plan clone");
      }
    });

    await attempt("plans and cascaded goals", async () => {
      const plans = unwrap(await client.from("plans")
        .select("id,user_id,title").eq("user_id", state.userId)
        .eq("title", "AUTOMATED_E2E_PLAN_" + state.runId), "Find run-tagged plan");
      for (const plan of plans) {
        await deleteExact(client, "plans", {
          id: plan.id, user_id: state.userId, title: plan.title,
        }, "run-tagged plan");
      }
    });

    await attempt("workout histories", async () => {
      const workouts = await resolveWorkouts(client, state);
      for (const row of workouts) {
        await deleteExact(client, "workout_history", {
          id: row.id, user_id: state.userId,
          client_save_id: row.client_save_id, notes: row.notes,
        }, "training-history fixture");
      }
    });

    await attempt("final baseline verification", async () => {
      const remain = await counts(client, state.userId);
      assert.deepEqual(remain, {
        workout_history: state.baseline.workout_history,
        posts: state.baseline.posts, plans: state.baseline.plans,
        goals: state.baseline.goals,
      }, "Test user did not return to baseline counts");
      const templateIds = await existingWorkoutIds(client, state.userId);
      assert.deepEqual(templateIds, state.baseline.existingWorkoutIds,
        "Unexpected user workout template changes");
      const finalProfile = unwrap(await client.from("profiles")
        .select("active_plan_id,weekly_workout_goal,settings")
        .eq("id", state.userId).single(), "Verify profile restored");
      assert.equal(finalProfile.active_plan_id, state.baseline.active_plan_id);
      assert.equal(finalProfile.weekly_workout_goal, state.baseline.weekly_workout_goal);
      assert.deepEqual(finalProfile.settings, state.baseline.settings);
      assert.equal(await notificationCount(client, state.userId),
        state.baseline.notificationCount, "Unexpected notification side effects");
      for (const post of state.posts.filter(x => x.postId)) {
        const comments = unwrap(await client.from("post_comments").select("id")
          .eq("post_id",post.postId), "Verify comments cascaded");
        const likes = unwrap(await client.from("post_likes").select("post_id")
          .eq("post_id",post.postId), "Verify likes cascaded");
        assert.deepEqual(comments, [], "Test post comments remain after deletion");
        assert.deepEqual(likes, [], "Test post likes remain after deletion");
      }
      console.log("PASS CLEANUP: no test workouts/posts/plans/goals/clones left; profile and original template preserved");
    });
    if (failures.length) {
      throw new Error(failures.join("; "));
    }
    fs.unlinkSync(MANIFEST);
  } finally {
    await client.auth.signOut();
  }
}

const stages = { setup, test: tests, cleanup };
if (require.main === module) {
  const stage = process.argv[2];
  if (!stages[stage]) {
    console.error("Usage: node scripts/e2e/production-known-history.cjs setup|test|cleanup");
    process.exitCode = 2;
  } else {
    stages[stage]().catch(e => {
      console.error(stage.toUpperCase() + " FAILED: " + e.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { stages, finiteNumber, exact, near, SCENARIOS, EXTRA };

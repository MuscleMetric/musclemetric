#!/usr/bin/env node
"use strict";

/**
 * Production E2E against the *existing* @tester account.
 *
 * Never use a service-role token. Only save a Quick Start workout with a unique
 * client_save_id, read it using that user's JWT, then delete only that fixture.
 * NOT part of PR CI by default: it requires GitHub Action secrets.
 */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { sourceConstant } = require("../verify-production-workout-rpc.cjs");
const { workoutPayload } = require("./tester-workout-flow.cjs");

function unwrap(result, label) {
  if (result.error) throw new Error(label + ": " + result.error.message + " (" + result.error.code + ")");
  return result.data;
}

async function main() {
  const email = process.env.E2E_TESTER_EMAIL;
  const password = process.env.E2E_TESTER_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_TESTER_EMAIL and E2E_TESTER_PASSWORD GitHub Actions secrets; test not run.");
  }
  const source = fs.readFileSync(path.join(__dirname, "../../lib/supabase.ts"), "utf8");
  const url = sourceConstant(source, "SUPABASE_URL");
  const anonKey = sourceConstant(source, "SUPABASE_ANON_KEY");
  if (new URL(url).hostname !== "cpzgnhchdpkxnebjsyyi.supabase.co") {
    throw new Error("Unexpected target: production tester test is locked to MuscleMetric production.");
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let clientSaveId = null;
  let userId = null;
  let originalFailure = null;

  try {
    const signedIn = unwrap(await client.auth.signInWithPassword({ email, password }), "Tester sign in");
    userId = signedIn.user.id;
    const profile = unwrap(await client.from("profiles")
      .select("id,username").eq("id",userId).single(), "Verify signed-in profile");
    assert.equal(profile.username?.toLowerCase(), "tester",
      "Refusing to write: provided credentials do not belong to username tester");

    const { data: strength, error: strengthError } = await client.from("exercises")
      .select("id").eq("is_public",true).eq("type","strength").limit(1);
    unwrap({ data: strength, error: strengthError }, "Select public strength exercise");
    const cardio = unwrap(await client.from("exercises")
      .select("id").eq("is_public",true).eq("type","cardio").limit(1),
    "Select public cardio exercise");
    assert.ok(strength?.[0]?.id && cardio?.[0]?.id, "Fixture exercises must be available");

    clientSaveId = randomUUID();
    const marker = "AUTOMATED_E2E_FIXTURE production-" + clientSaveId;
    const payload = workoutPayload({
      clientSaveId, label: "production-" + clientSaveId,
      exercises: [
        { id: strength[0].id, sets: [{ reps: 5, weight: 2 }] },
        { id: cardio[0].id, sets: [{ time_seconds: 60, distance: 0.2 }] },
      ],
    });
    assert.equal(payload.notes, marker);
    const args = { p_workout: payload, p_expected_user_id: userId };
    const historyId = unwrap(await client.rpc("save_completed_workout_v2", args),
      "Authenticated production workout save");
    const retryId = unwrap(await client.rpc("save_completed_workout_v2", args),
      "Idempotent production save retry");
    assert.equal(retryId, historyId);

    const detail = unwrap(await client.rpc("get_workout_history_detail", {
      p_workout_history_id: historyId,
    }), "Get production workout history detail");
    assert.equal(detail.header.workout_history_id, historyId);
    assert.equal(Number(detail.stats.sets_count), 2);
    assert.equal(Number(detail.stats.volume_kg), 10);
    assert.equal(Number(detail.stats.distance_total), 0.2);
    assert.equal(detail.exercises.length, 2);

    const feed = unwrap(await client.rpc("get_workout_history_feed", {
      p_limit: 20, p_cursor_completed_at: null, p_cursor_id: null, p_query: null,
    }), "Get production history feed");
    assert.equal(feed.items.filter((x) => x.workout_history_id === historyId).length, 1);
    console.log("PASS actual production tester authenticated save/read/retry");
  } catch (error) {
    originalFailure = error;
  } finally {
    if (userId && clientSaveId) {
      try {
        // Delete by both unpredictable run UUID and verified owner, and only
        // if the row has the exact E2E notes marker. No other records touched.
        const existing = unwrap(await client.from("workout_history")
          .select("id,notes,client_save_id").eq("user_id",userId)
          .eq("client_save_id",clientSaveId), "Find only this run's fixture");
        for (const row of existing) {
          if (row.notes !== "AUTOMATED_E2E_FIXTURE production-" + clientSaveId) {
            throw new Error("Fixture marker mismatch. Cleanup blocked; inspect manually.");
          }
          const deleted = unwrap(await client.from("workout_history")
            .delete().eq("id",row.id).eq("user_id",userId)
            .eq("client_save_id",clientSaveId).eq("notes",row.notes).select("id"),
          "Cleanup E2E workout");
          assert.equal(deleted.length,1,"Fixture cleanup must delete exactly one history row");
        }
        const remaining = unwrap(await client.from("workout_history")
          .select("id").eq("user_id",userId).eq("client_save_id",clientSaveId),
        "Verify fixture deletion");
        assert.equal(remaining.length,0,"E2E workout cleanup left residual history");
        console.log("PASS production tester fixture cleanup");
      } catch (cleanupError) {
        originalFailure = new Error(
          (originalFailure ? originalFailure.message + "; " : "") +
          "CLEANUP FAILURE: " + cleanupError.message,
        );
      }
    }
    await client.auth.signOut();
  }
  if (originalFailure) throw originalFailure;
}
main().catch((error) => { console.error("LIVE TESTER E2E FAILED:", error.message); process.exitCode=1; });

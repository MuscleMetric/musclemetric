"use strict";

/**
 * Non-mutating live API smoke test for the critical workout-save RPC.
 *
 * A build can pass Jest and local Supabase pgTAP tests even if its migrations
 * were never deployed to production. This checks the actual PostgREST endpoint
 * using the same public URL/key as the shipped app.
 *
 * The probe runs as ANON and must be rejected with a database EXECUTE
 * permission error. That proves the function is exposed to PostgREST without
 * creating a workout or needing a real user's access token.
 */
const fs = require("node:fs");
const path = require("node:path");

const FUNCTION = "save_completed_workout_v2";
const REQUIRED_ARGUMENTS = ["p_expected_user_id", "p_workout"];

/**
 * Verify the live-app callsite still matches the endpoint this preflight
 * checks. If the app switches to v3 or changes parameter names, block the
 * build until the production probe is explicitly updated and verified.
 */
function assertWorkoutSaveContract(source) {
  const calls = [...source.matchAll(
    /\bsupabase\s*\.\s*rpc\s*\(\s*(['"])([A-Za-z_][A-Za-z_0-9]*)\1\s*,\s*\{([\s\S]*?)\}\s*\)/g,
  )];
  if (calls.length !== 1) {
    throw new Error("Expected exactly one static Supabase RPC call in lib/workoutSaveRpc.ts; release blocked.");
  }
  const [, , name, argumentObject] = calls[0];
  const keys = [...argumentObject.matchAll(
    /(?:^|,)\s*([A-Za-z_][A-Za-z_0-9]*)\s*:/gm,
  )].map((match) => match[1]).sort();

  if (name !== FUNCTION || JSON.stringify(keys) !== JSON.stringify(REQUIRED_ARGUMENTS)) {
    throw new Error(
      `Workout save callsite uses ${name}(${keys.join(", ")}), but live preflight checks ${FUNCTION}(${REQUIRED_ARGUMENTS.join(", ")}). Update and validate the preflight before release.`,
    );
  }
  return true;
}

function assertWorkoutSaveMigration() {
  const migrationDir = path.join(__dirname, "../supabase/migrations");
  const declaration = new RegExp(
    `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${FUNCTION}\\s*\\(`,
    "i",
  );
  const present = fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .some((name) => declaration.test(fs.readFileSync(path.join(migrationDir, name), "utf8")));
  if (!present) throw new Error(`No SQL migration declares public.${FUNCTION}; release blocked.`);
}

function assertWorkoutSaveReleaseContract() {
  const rpcSource = fs.readFileSync(path.join(__dirname, "../lib/workoutSaveRpc.ts"), "utf8");
  assertWorkoutSaveContract(rpcSource);
  assertWorkoutSaveMigration();
}

function sourceConstant(source, name) {
  const match = source.match(new RegExp(
    `\\bconst\\s+${name}\\s*=\\s*["']([^"'\\n]+)["']`,
  ));
  if (!match) {
    throw new Error(`Cannot locate ${name} in lib/supabase.ts. Supply environment configuration.`);
  }
  return match[1];
}

function getAppSupabaseConfig() {
  const source = fs.readFileSync(path.join(__dirname, "../lib/supabase.ts"), "utf8");
  return {
    url: process.env.SUPABASE_URL || sourceConstant(source, "SUPABASE_URL"),
    anonKey: process.env.SUPABASE_ANON_KEY || sourceConstant(source, "SUPABASE_ANON_KEY"),
  };
}

async function verifyWorkoutRpc({ url, anonKey, fetchImpl = fetch }) {
  if (!url || !anonKey) throw new Error("Supabase URL and anon key are required.");
  const response = await fetchImpl(
    `${url.replace(/\/+$/, "")}/rest/v1/rpc/${FUNCTION}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      // Always send an invalid owner; this probe MUST NOT save a workout.
      body: JSON.stringify({ p_workout: {}, p_expected_user_id: null }),
      signal: AbortSignal.timeout(15000),
    },
  );

  let error;
  try {
    error = await response.json();
  } catch {
    throw new Error(`Unexpected non-JSON response (HTTP ${response.status}) from production RPC.`);
  }

  if (error?.code === "PGRST202") {
    throw new Error(`Production is missing ${FUNCTION}(p_workout, p_expected_user_id); deploy its migration before building.`);
  }

  if (!response.ok &&
      error?.code === "42501" &&
      /permission denied.*function/i.test(String(error.message))) {
    return true; // Found function; anonymous role correctly cannot execute it.
  }

  throw new Error(
    `Unexpected production RPC response (HTTP ${response.status}, code ${String(error?.code)}, message ${String(error?.message)}). Release blocked.`,
  );
}

async function main() {
  if (process.env.EAS_BUILD && process.env.EAS_BUILD_PROFILE !== "production") {
    console.log("Production workout RPC preflight skipped for non-production EAS build.");
    return;
  }
  assertWorkoutSaveReleaseContract();
  await verifyWorkoutRpc(getAppSupabaseConfig());
  console.log("Production workout save RPC is deployed and rejects anonymous calls.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Production release preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { sourceConstant, verifyWorkoutRpc, assertWorkoutSaveContract, assertWorkoutSaveMigration, assertWorkoutSaveReleaseContract };

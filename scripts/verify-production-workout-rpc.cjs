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
    `${url.replace(/\\/+$/, "")}/rest/v1/rpc/${FUNCTION}`,
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
  await verifyWorkoutRpc(getAppSupabaseConfig());
  console.log("Production workout save RPC is deployed and rejects anonymous calls.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Production release preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { sourceConstant, verifyWorkoutRpc };

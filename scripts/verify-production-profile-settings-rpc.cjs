"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { sourceConstant } = require("./verify-production-workout-rpc.cjs");

function checkProfileResponse(response, body) {
  if (body?.code === "PGRST202") {
    throw new Error("MISSING PRODUCTION RPC: public.set_profile_settings_v1(p_key, p_value)");
  }
  if (!response.ok && body?.code === "42501" &&
      /permission denied.*function/i.test(String(body.message))) return true;
  throw new Error("Profile settings RPC: unexpected anonymous response code " + body?.code);
}

async function verifyProfileRpc({ url, anonKey, fetchImpl = fetch }) {
  const target = new URL(url);
  if (target.hostname !== "cpzgnhchdpkxnebjsyyi.supabase.co" ||
      target.protocol !== "https:") throw new Error("Incorrect production API target");
  const response = await fetchImpl(url + "/rest/v1/rpc/set_profile_settings_v1", {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: "Bearer " + anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_key: "__invalid_check__", p_value: "__invalid_check__" }),
    signal: AbortSignal.timeout(15000),
  });
  return checkProfileResponse(response, await response.json());
}

if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, "../lib/supabase.ts"), "utf8");
  verifyProfileRpc({
    url: sourceConstant(source, "SUPABASE_URL"),
    anonKey: sourceConstant(source, "SUPABASE_ANON_KEY"),
  }).then(() => console.log("PASS: profile settings function deployed, anon denied"))
    .catch(e => { console.error("FAIL:", e.message); process.exitCode = 1; });
}

module.exports = { verifyProfileRpc, checkProfileResponse };

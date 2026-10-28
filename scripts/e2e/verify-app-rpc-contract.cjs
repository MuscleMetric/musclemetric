"use strict";

/**
 * CI backend-contract audit. Collects static RPC names actually called by the
 * React Native app and checks the PostgREST OpenAPI catalogue on a
 * disposable local database using the same authenticated E2E user.
 *
 * Never query production's GET /rest/v1/ with an app key: Supabase restricts
 * OpenAPI access to privileged keys. The production E2E tests real RPC calls.
 * Dynamic RPC expressions are reported separately, not falsely verified.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOTS = ["app", "lib"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (EXTENSIONS.has(path.extname(file))) out.push(file);
  }
  return out;
}

function discoverRpcCalls(root = path.join(__dirname, "../..")) {
  const calls = new Map();
  const dynamic = [];
  for (const folder of ROOTS) {
    const base = path.join(root, folder);
    for (const file of walk(base)) {
      const content = fs.readFileSync(file, "utf8");
      const matches = content.matchAll(/\.rpc\s*\(\s*(?:(['"])([a-zA-Z_][a-zA-Z0-9_]*)\1|([^,\n)]{1,80}))/g);
      for (const match of matches) {
        const where = path.relative(root, file);
        if (match[2]) {
          if (!calls.has(match[2])) calls.set(match[2], new Set());
          calls.get(match[2]).add(where);
        } else {
          dynamic.push({ file: where, expression: String(match[3]).trim() });
        }
      }
    }
  }
  return {
    calls: [...calls].map(([name, files]) => ({ name, files: [...files].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dynamic,
  };
}

async function verifyAuthenticatedRpcCatalogue({ url, anonKey, accessToken, fetchImpl = fetch,
  inventory = discoverRpcCalls() }) {
  // The OpenAPI catalogue may only be requested from disposable local Supabase.
  // Do not introduce a production override or a service-role key here.
  const { assertIsDisposableLocalDatabase } = require("./tester-workout-flow.cjs");
  assertIsDisposableLocalDatabase(url);
  assert.ok(accessToken && anonKey, "Authenticated tester JWT and anon key required");
  const response = await fetchImpl(url.replace(/\/+$/, "") + "/rest/v1/", {
    headers: {
      apikey: anonKey,
      Authorization: "Bearer " + accessToken,
      Accept: "application/openapi+json",
    },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.ok, true, "Unable to load authenticated PostgREST OpenAPI catalogue");
  const spec = await response.json();
  assert.ok(spec.paths && Object.keys(spec.paths).length, "PostgREST did not expose an RPC catalogue");
  const missing = inventory.calls.filter(({ name }) => !spec.paths["/rpc/" + name]);
  assert.deepEqual(missing, [], "App RPCs missing from authenticated local schema cache");
  return { verified: inventory.calls.length, dynamic: inventory.dynamic };
}

module.exports = { discoverRpcCalls, verifyAuthenticatedRpcCatalogue };

if (require.main === module) {
  console.error("Run as part of authenticated disposable tester E2E (requires a verified session).");
  process.exitCode = 1;
}

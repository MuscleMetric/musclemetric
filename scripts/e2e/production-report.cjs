"use strict";

// Allure's documented result JSON format keeps reporting independent from the
// production client's dependencies. No request bodies, credentials or manifest
// contents are attached. Each result is persisted before and after execution.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
const CASES = {
  prepare: ["Setup", "Verify tester and prepare recovery record"],
  setup: ["Setup", "Seed known workout history"],
  "seed-strength": ["Setup", "Save strength workout: 815 kg"],
  "seed-cardio": ["Setup", "Save cardio workout: 5 km"],
  "seed-mixed": ["Setup", "Save mixed workout: 400 kg and 3.2 km"],
  test: ["Checks", "Complete production validation sequence"],
  "analytics-initial": ["Analytics", "Home, progress and cardio match the three saved workouts"],
  "retry-strength": ["Workout saving", "Strength retry preserves identity and history totals"],
  "retry-cardio": ["Workout saving", "Cardio retry preserves identity and history totals"],
  "retry-mixed": ["Workout saving", "Mixed retry preserves identity and history totals"],
  ownership: ["Workout saving", "Reject a forged workout owner without writing data"],
  social: ["Social", "Private workout post, snapshot, comments, likes and invalid link"],
  privacy: ["Social", "Anonymous users cannot read the private post"],
  "extra-run": ["Workout saving", "Save another 2 km run"],
  "analytics-updated": ["Analytics", "Updated totals: 4 workouts, 10.2 km, 3600 seconds"],
  plans: ["Plans", "Create and rename plan, edit workouts and goal, reject forged owner"],
  screens: ["Screen APIs", "Seven screen APIs return data"],
  cleanup: ["Cleanup", "Restore tester account — required even when tests fail"],
  "cleanup-private posts": ["Cleanup", "Delete this run's private posts and children"],
  "cleanup-restore active plan": ["Cleanup", "Restore active plan after original or edited title"],
  "cleanup-run-tagged workout templates": ["Cleanup", "Delete only this run's plan clones"],
  "cleanup-plans and cascaded goals": ["Cleanup", "Delete this run's plan and goals"],
  "cleanup-workout histories": ["Cleanup", "Delete this run's workout history"],
  "cleanup-final baseline verification": ["Cleanup", "Verify original account state was restored"],
};
function directory() { return process.env.MM_ALLURE_RESULTS; }
function sanitize(value) {
  let text = String(value ?? "");
  for (const key of ["E2E_TESTER_EMAIL", "E2E_TESTER_PASSWORD", "GITHUB_TOKEN", "GH_TOKEN"]) {
    if (process.env[key]) text = text.split(process.env[key]).join("[REDACTED]");
  }
  return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[TOKEN]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]");
}
function save(result) {
  if (!directory()) return;
  fs.mkdirSync(directory(), { recursive: true });
  const file = path.join(directory(), result.uuid + "-result.json");
  fs.writeFileSync(file + ".tmp", JSON.stringify(result, null, 2));
  fs.renameSync(file + ".tmp", file);
}
function resultFor(id) {
  const [suite, name] = CASES[id] || ["Workflow", id];
  return { uuid: crypto.randomUUID(), historyId: id, testCaseId: id,
    fullName: "production-known-history." + id, name,
    status: "unknown", stage: "running", start: Date.now(), steps: [],
    labels: [{ name: "parentSuite", value: process.env.MM_REPORT_PREVIEW === "true" ?
      "REPORT PREVIEW — simulated, no production calls" : "MuscleMetric production API" },
    { name: "suite", value: suite }, { name: "framework", value: "Node scripts" }],
    description: "API-level verification. Unexecuted checks are skipped; cleanup is independently reported.",
  };
}
async function run(id, action) {
  if (!directory()) return action();
  const result = resultFor(id);
  save(result);
  try {
    const value = await context.run(result, action);
    result.status = "passed";
    return value;
  } catch (error) {
    result.status = error.code === "ERR_ASSERTION" || error.name === "AssertionError" ? "failed" : "broken";
    result.statusDetails = { message: sanitize(error.message), trace: sanitize(error.stack) };
    throw error;
  } finally {
    result.stage = "finished";
    result.stop = Date.now();
    save(result);
  }
}
function check(name, action, detail) {
  const result = context.getStore();
  if (!result) return action();
  const step = { name: sanitize(name), status: "passed", stage: "finished", start: Date.now() };
  if (detail) step.parameters = Object.entries(detail).map(([name, value]) => ({ name, value: sanitize(value) }));
  try { return action(); } catch (error) {
    step.status = "failed";
    step.statusDetails = { message: sanitize(error.message) };
    throw error;
  } finally { step.stop = Date.now(); result.steps.push(step); save(result); }
}
function finalize() {
  if (!directory()) throw new Error("MM_ALLURE_RESULTS must be set");
  fs.mkdirSync(directory(), { recursive: true });
  const results = fs.readdirSync(directory()).filter(x => x.endsWith("-result.json"))
    .map(x => JSON.parse(fs.readFileSync(path.join(directory(), x), "utf8")));
  for (const result of results) {
    if (result.stage !== "finished") {
      result.status = "broken"; result.stage = "finished"; result.stop = Date.now();
      result.statusDetails = { message: "Execution was interrupted; completion was not confirmed." };
      save(result);
    }
  }
  for (const id of Object.keys(CASES)) {
    if (results.some(x => x.testCaseId === id)) continue;
    const result = resultFor(id);
    result.status = "skipped"; result.stage = "finished"; result.stop = result.start;
    result.statusDetails = { message: "Not executed: an earlier step failed, or this is a cleanup-only run." };
    save(result); results.push(result);
  }
  const cleanup = results.find(x => x.testCaseId === "cleanup-final baseline verification");
  const clean = cleanup.status === "passed" && results.find(x => x.testCaseId === "cleanup")?.status === "passed";
  const escape = x => sanitize(x).replace(/[|\r\n]/g, " ").replace(/</g, "&lt;");
  const summary = ["## MuscleMetric production test report", "",
    process.env.MM_REPORT_PREVIEW === "true" ? "**SIMULATED PREVIEW — no production tests ran.**" : "**Real production API run**",
    "", clean ? "**Cleanup: account baseline verified.**" : "**Cleanup: NOT VERIFIED. Inspect cleanup before running again.**",
    "", "Download the Allure report artifact, unzip it and open index.html in your browser.", "",
    "| Area | Check | Result |", "| --- | --- | --- |",
    ...results.map(r => `| ${r.labels.find(x => x.name === "suite").value} | ${r.name} | ${r.status} |`),
    "", "### Failures", "",
    ...results.filter(r => ["failed", "broken"].includes(r.status)).map(r =>
      `- **${r.name}**: ${escape(r.statusDetails?.message)}`), ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  fs.writeFileSync(path.join(directory(), "summary.md"), summary);
  return results;
}
module.exports = { CASES, run, check, finalize, sanitize };
if (require.main === module) {
  if (process.argv[2] !== "finalize") throw new Error("Usage: production-report.cjs finalize");
  finalize();
}

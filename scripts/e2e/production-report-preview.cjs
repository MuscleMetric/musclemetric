"use strict";
// Deliberate, clearly labelled sample outcomes. Never imports the production
// client and never contacts Supabase. Exercises the same writer and generator.
const assert = require("node:assert/strict");
const report = require("./production-report.cjs");
process.env.MM_REPORT_PREVIEW = "true";
async function main() {
  await report.run("prepare", async () => {});
  await report.run("setup", async () => {});
  await report.run("seed-strength", async () => {});
  await report.run("seed-cardio", async () => {});
  await report.run("seed-mixed", async () => {});
  try {
    await report.run("analytics-initial", async () => {
      report.check("Cardio distance includes the mixed workout (simulated failure)",
        () => assert.equal(5, 8.2, "Expected 8.2 km; received 5 km"),
        { expected: "8.2 km", actual: "5 km" });
    });
  } catch (error) {
    assert.equal(error.code, "ERR_ASSERTION");
  }
  await report.run("cleanup", async () => {
    for (const id of Object.keys(report.CASES).filter(x => x.startsWith("cleanup-"))) {
      await report.run(id, async () => {});
    }
  });
  report.finalize();
}
main().catch(error => { console.error(error); process.exitCode = 1; });

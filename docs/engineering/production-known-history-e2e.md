# Production known-history tests and Allure reports

## First preview — no production writes

Open PR #60 → Checks → **Allure preview and recovery regression tests** → Details.
On the workflow summary, download **allure-preview-no-production-<run ID>**.
Unzip and open `index.html` in a browser. This standalone Allure report contains
SIMULATED passing, failing and skipped results. The deliberate distance failure
shows expected 8.2 km versus actual 5 km; it is not evidence of a production bug.
The preview job passes if regression tests and report generation succeed.

## First real run

Wait for PR checks to pass and review/merge the PR yourself. The assistant must
not merge it. A new workflow must be present on the default branch before its
manual dispatch button is available.

GitHub → Actions → **Production deterministic history E2E** → Run workflow →
branch `main`. Leave **recovery_run_id blank** for a normal run. Leave the
`ENABLE_PRODUCTION_FULL_E2E` repository variable disabled until a supervised
run has passed both validation and final cleanup verification.

The workflow requires the existing E2E_TESTER_EMAIL / E2E_TESTER_PASSWORD
secrets. It locks the exact production hostname, tester ID and username, uses
ordinary authenticated calls, and shares the existing live tester concurrency
lock. No migrations or service-role credentials are used. Scheduling, when
explicitly enabled, is 04:13 UTC daily (UK time changes with daylight saving).

## What runs

1. **Prepare, before writes:** require empty tester history/posts/plans/goals
   and no active plan; snapshot baseline counts, template IDs, weekly goal,
   notification count and a hash of settings. Pre-register all four workout
   client-save IDs and the private post caption. Upload a minimal recovery
   artifact before seeding. If upload fails, seeding cannot start.
2. **Setup:** save strength (815 kg), cardio (5 km / 1800 s), and mixed
   (400 kg + 3.2 km / 1200 s) workouts through save_completed_workout_v2.
3. **Checks:** independently verify stored rows and home/progress/history/
   cardio analytics totals; retry saves; reject forged ownership; create a
   private workout post, check snapshot/detail/comment/like/unlike and invalid
   linked-workout rejection; verify anonymous invisibility; save a fourth
   2 km / 600 s run; create/edit a plan and goal; read seven screen APIs.
4. **Cleanup:** always attempt each cleanup category independently, resolve
   plans by recorded ID plus owner/marker or both exact original/edited
   titles, delete only this run's data, restore its active-plan reference and
   verify the original baseline. Capture a created plan ID immediately, before
   subsequent reads/assertions can fail. Recovery also handles a committed
   create/edit whose response was lost.

Production no longer requests the privileged PostgREST OpenAPI catalogue.
The local disposable database audit remains separate. These are representative
API tests, not iPhone UI automation, cross-user privacy certification, or
exhaustive testing of all RPCs/Edge Functions.

## Reading the real report

Open the completed run's Summary and use **Download Allure report** (artifact
`production-allure-report-<run ID>-<attempt>`). Unzip, find `index.html` and open
it directly. The report groups Setup, Workout saving, Analytics, Social, Plans,
Screen APIs and Cleanup. Expand a failed check for the exact assertion and
numeric expected/actual values. Successful API reads appear as steps.

- **Passed:** that check completed successfully.
- **Failed:** an assertion did not match the expectation.
- **Broken:** a request/runtime error or interrupted execution prevented completion.
- **Skipped:** not executed after an earlier failure or during cleanup-only recovery.

The overall sequence and its individual checks are both listed; the count is
not a count of distinct app features. Cleanup is independently reported and any
cleanup failure still fails the workflow. A reporting failure also fails its
step, and never changes a failed test to success. A skipped or missing cleanup
verification is NOT proof that the account is clean.

The summary is readable without Allure. Reports are downloadable artifacts,
not a hosted public dashboard, and expire after 14 days. Report messages redact
known secrets, emails, UUIDs and JWTs; no response bodies or recovery manifests
are attached to the report. No historical trend persistence is configured yet.

## Recovery after a failed or killed runner

1. Do not start another normal test over leftovers. Locate the **original**
   run ID in its Actions URL and attempt number on its run page.
2. Verify the original run has stopped. Run the same workflow on `main`, set
   `recovery_run_id` to that numeric run ID and `recovery_attempt` to its attempt
   (usually 1). This validates the source workflow, downloads its pre-write
   record and runs **cleanup only**. It never seeds or runs feature tests.
3. Check **Cleanup → Verify original account state was restored** and the
   workflow conclusion. If green, a fresh normal test is safe. Recovery is
   repeatable using the same original artifact; never reset the tester wholesale.
4. If recovery fails, inspect the specific category before retrying. Changed
   ownership/markers, unrelated active plans or baseline changes require manual
   investigation and are intentionally not overwritten.

The `production-recovery-<run ID>-<attempt>` artifact is retained for 30 days.
It contains tester/template IDs, fixture markers, baseline counts/weekly goal
and a settings hash; no passwords, JWTs or raw settings. Anyone permitted to
read Actions artifacts can read it. It is separate from the Allure report.
Download it before expiry if recovery remains unresolved. If unavailable,
stop and investigate using the run UUID from the Prepare log; there is no
broad-delete fallback. Older runs without a version-2 recovery record need
manual investigation.

Uploading **before** writes protects against abrupt loss of the runner. No
workflow can guarantee final reporting/cleanup after forcible termination;
recovery from the saved record is the supported route.

## Local verification without production access

```bash
npm ci
npm run test:ci -- __tests__/scripts/productionKnownHistory.test.js __tests__/scripts/productionRecovery.test.js __tests__/scripts/productionReport.test.js
npm ci --prefix tools/allure --ignore-scripts
MM_ALLURE_RESULTS=ci-artifacts/allure-results node scripts/e2e/production-report-preview.cjs
MM_REPORT_PREVIEW=true tools/allure/node_modules/.bin/allure generate --clean --config tools/allure/allurerc.mjs ci-artifacts/allure-results
```

Use a fresh results directory for each run. The report generator is pinned and
locked in tools/allure to keep it outside the mobile app dependency graph.

# iOS frontend E2E and Allure

Maestro drives a standalone iPhone Simulator app on a GitHub-hosted Mac. It connects to the existing production Supabase project using only `E2E_TESTER_EMAIL` and `E2E_TESTER_PASSWORD`. No Supabase branch, new account, service-role key, catalogue change or Android runner is needed.

Results appear under **Native frontend — iOS / First user journeys** in Allure.

| Journey | Assertions |
| --- | --- |
| Authentication | Real password login, session restore after relaunch, logout, rejected invalid password |
| Workout | Enter 50 kg × 10 reps, save, open history and see 500 kg; authenticated backend read verifies one saved workout and set |
| Progress | Existing public cardio exercise with two run-owned histories: 5 km, 25 minutes and 5:00/km |
| Recovery | Enter a set, stop the app, reopen with the loopback proxy returning 503, recover values, reconnect and save exactly once |
| Plans | Create from a fixture template, edit title and reopen. **Skipped when there is no existing current-week stats row**, because production has no owner DELETE policy to undo the row that the real creation screen inserts |
| Social | Owner can view a run-owned private post and log out |

Signed-in stranger privacy is a separate **skipped** result: only one tester credential pair is configured. Owner visibility does not prove cross-account access control. Backend isolation tests remain separate.

## Run and view

Run **iOS frontend E2E (Maestro)** in GitHub Actions, selecting `test/native-maestro-suite` while reviewing PR #65. The same job is called after production reference cleanup by **Production deterministic history E2E**, whose report merges native, backend and production results. PRs from the same repository also trigger the native workflow; forks never receive secrets or run this production job.

Download `native-frontend-report-<run>-<attempt>` (or the combined report), unzip and open `index.html`. Failures include sanitized diagnostics and available screenshots. Missing executions become skipped journeys plus a broken suite result. A green workflow does not mean skipped coverage was executed. Building on the hosted Mac may take substantially longer than backend checks.

## Production boundaries and recovery

The scripts authenticate and verify the exact tester UUID and username before accessing fixtures. Training history, posts, plans, goals, drafts and active plan must be empty. Existing templates and profile preferences are recorded. All fixture UUIDs and exact titles are persisted in a **credential-free recovery artifact before any writes**. Public exercises are reused without modification. Posts are private.

Standalone native and existing production workflows share the `live-tester-workout-e2e` concurrency lock with cancellation disabled. The combined workflow runs its native job only after production cleanup; its outer workflow owns the shared lock. Do not manually use the tester account during a run.

Cleanup stops the simulator app, removes only run-owned records and restores the saved profile and weekly stats. It verifies original counts and templates. Cleanup failure fails the job and retains the recovery artifact. If a runner is forcibly terminated, run this workflow with `recovery_run_id` and `recovery_run_attempt` pointing to the **completed** interrupted run; this performs cleanup only. Do not rerun fixtures over a dirty tester account. Recovery artifacts expire after 30 days.

The native app uses a distinct `.e2e` bundle ID and test-only password form. It connects to a loopback proxy forwarding only Auth/REST to the fixed production host. The proxy replaces the placeholder public key with the existing public anon key; user JWTs remain ordinary authenticated sessions. Offline testing affects only this local proxy, never the production service. Normal builds keep their existing authentication UI.

## Limits

This suite has no Android implementation. Provider-owned Apple/Google sign-in screens, push delivery, background eviction, Live Activities, realtime WebSockets and physical-device behavior are outside this first suite. Plans are not claimed as executed until their cleanup prerequisite is met. No schema permission changes are made by the workflow.

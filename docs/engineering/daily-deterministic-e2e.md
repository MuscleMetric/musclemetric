# Daily deterministic user-history E2E

## Schedule and isolation

The new \`.github/workflows/daily-deterministic-e2e.yml\` runs every day at
**02:05 UTC** (and supports manual \`workflow_dispatch\`). It starts a separate
Supabase instance on an ephemeral GitHub Actions runner, applies all migrations,
runs pgTAP, creates a fresh user, and logs known training sessions.

After every outcome, including test failure, it attempts
\`supabase stop --no-backup\` to delete the local database and every temporary
auth user, plan, completed session, and exercise. The GitHub Actions runner
itself is also disposable. Tomorrow starts from no test data.

**No production key, credentials or production database URL are given to this
workflow.** The test script explicitly refuses non-loopback Supabase endpoints.
The existing separate daily production tester smoke test continues its much
narrower, ownership-and-marker-scoped save/read/cleanup. Never truncate or
"reset" the production tester account: pre-existing workouts can belong to it.

## Exact reference fixture

| Scenario | Sets | Strength volume | Cardio distance | Cardio duration |
| --- | ---: | ---: | ---: | ---: |
| Strength (100 kg x 5, 105 kg x 3) | 2 | 815 kg | — | — |
| Cardio (5 km, 1800 s) | 1 | 0 kg | 5 km | 1800 s |
| Mixed (50 kg x 8, 3.2 km / 1200 s) | 2 | 400 kg | 3.2 km | 1200 s |
| **Overall** | **5** | **1215 kg** | **8.2 km** | **3000 s** |

Each scheduled run asserts:

- Before seeding: no user workout history, no completed workouts, zero volume.
- After seeding: exact stored history rows, exercise rows and set rows.
- Independent arithmetic over raw tables, with no shared progress/analytics
  functions used to calculate the expected outcomes.
- \`get_home_summary\`: correct lifetime count and new-user progress card.
- \`get_progress_overview\`: correct lifetime/30-day and monthly totals,
  volume, prior period, user ID and last workout IDs.
- \`get_workout_history_feed\`: all three matching rows and exact per-workout
  lifting volume (including **0**, not \`null\`, for cardio).
- \`get_exercise_deep_analytics\`: two runs, 8.2 km, 3000 seconds and
  distance-weighted average pace (~366 seconds/km).
- Repeated \`save_completed_workout_v2\` returns the same history ID.
- Invalid owner is rejected and leaves no workout-history row.
- An independently authenticated second user sees no other user's history.
- Full plan create/edit, goals/settings, session bootstrap and other previous
  authenticated read checks still run.
- All statically named application RPCs must exist in authenticated PostgREST.

JUnit/Jest tests verify the oracle helper *itself* fails on missing, nonnumeric
or incorrect values, avoiding \`Number(null) === 0\` false positives.

## What this does not guarantee

The 55 known static RPC name availability checks are **not 55 complete
behavioural outcome tests**. Eight dynamic call sites require manual resolution.
This run does not yet exercise every Edge Function, every direct-table CRUD
operation, all possible network failures, or iOS screen navigation through
Maestro/Detox. Those deserve additional staged fixture scenarios and a
simulator-backed suite. Real production deployment/API drift remains covered
by the separately scheduled production tester workflow.

## What to read when a run fails

Open the \`Daily deterministic history E2E\` GitHub Action run and download
the \`daily-fixture-e2e-<run>\` artifact (14-day retention). Look for the
specific \`E2E FAILED\` assertion. A failed test leaves no permanent testing
account because the local database is disposable. Do not "fix" a failing
expectation by weakening the known inputs; investigate the discrepancy.

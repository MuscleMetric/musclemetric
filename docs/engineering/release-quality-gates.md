# MuscleMetric release quality gates

## Incident that prompted this policy (22 October 2026)

The app called `public.save_completed_workout_v2(p_workout, p_expected_user_id)`
but production only had V1. Jest mocked the RPC and pgTAP ran against a
freshly migrated **local** database, so both passed. Production was missing
the migration. A production-only schema mismatch is not caught by local tests.

The production migration was applied directly on 22 October. The repository's
migration history and the production migration history now have different
version numbers for the V2 function; reconcile this drift before the next
schema deploy, rather than blindly applying an already-present function.

## Automatic checks (fail closed)

1. **Lint and types:** ESLint and TypeScript are required.
2. **Unit/integration behaviour:** Jest tests validate payload building,
   ownership propagation, persistence errors, retry identities, and cardio
   serialization. Any changed behaviour needs a new regression test.
3. **Database semantics + real API E2E:** CI starts a fresh Supabase instance,
   reapplies repository migrations and runs the pgTAP suite (including V2
   permissions, cross-user rejection, and idempotency). It then creates a
   disposable Supabase Auth account with username `tester` and saves strength,
   cardio, and mixed workouts **over HTTP using its authenticated JWT**. It
   retries each save and checks history detail, sets, volume, distance and
   history feed. It must reject an incorrect owner and cannot run against
   a non-local Supabase instance.
4. **Real production compatibility:** `scripts/verify-production-workout-rpc.cjs`
   calls the live production PostgREST endpoint with an anonymous JWT and
   deliberately invalid parameters. Passing requires a `42501` database
   execute-permission rejection for the *deployed* function. A missing schema
   function (`PGRST202`), unexpected response, or network failure blocks the
   check. The probe must not save a real workout.
5. **Prevent stale checks:** The preflight validates that
   `lib/workoutSaveRpc.ts` calls the **same RPC name and argument keys**
   that the check covers, and that the repo contains its SQL declaration.
   A new RPC name/signature cannot silently reuse the old smoke test.
6. **Build-time gate:** Production EAS builds run the preflight through the
   `eas-build-pre-install` hook. Preview/development builds skip the
   production-only check.
7. **GitHub gate:** The overall CI gate requires all checks to succeed.

The production compatibility probe is **narrow**: it proves the specific
workout-save RPC exists and is not executable by anonymous users. It does
**not** prove that every other RPC exists, that all migrations were deployed
or that authenticated workouts succeed end-to-end. Do not present it as
a complete live-system test.

## Required order for changes that introduce an RPC or new data dependency

1. Write SQL migration and pgTAP tests first.
2. Apply to a disposable test environment and run database behaviour tests.
3. Deploy a backwards-compatible migration to production *before* shipping
   an app build that depends on it. Preserve old RPC signatures for users
   still on older app versions.
4. Reconcile production and repository migration ledgers and inspect
   `supabase migration list` / remote project migrations for un-applied entries.
   This is a human gate until a secure migration-inventory CI credential is
   configured; the current live RPC probe alone is not a full drift check.
5. Update the production preflight if the critical save function changes.
   Do not weaken it by accepting an arbitrary HTTP error.
6. Require CI to pass on the intended release commit and ensure the CI gate
   is configured as a required GitHub status check.
7. Build/TestFlight only after the live compatibility gate passes.

## Release candidate device checks (human sign-off until E2E automation exists)

Use a dedicated test account and verify these flows on the **release build**,
not just an Expo developer session.

| Scenario | Expected outcome |
| --- | --- |
| Strength-only workout | Save; same exercises, sets, weights and total volume appear in history |
| Cardio-only workout | Save; time, distance and activity type visible in recent activity and deep analytics |
| Mixed strength and cardio | Save; both strength volume and cardio details survive |
| Planned workout | Save; history appears and plan completion changes correctly |
| Offline/network-loss during save | Visible failure, draft preserved; retry once online without duplicates |
| Double tap / interrupted-save retry | Same `client_save_id`, exactly one workout history row |
| Account switch with queued workout | Correct owner enforced; no cross-account writes |
| App restart after save | Saved history remains; finished draft does not relaunch |
| Summary / share after save | UI renders without missing sets/volume or cardio summary data |

**Stop release** if any required check fails. Record the build number,
backend migration version and manual check results with the release.


## Two tester environments

- **Required in every pull request:** `scripts/e2e/tester-workout-flow.cjs`
  uses a newly created `tester` account inside a disposable local Supabase
  database. No production user records, passwords or service-role keys are
  required. The local fixture and database are thrown away after the job.
- **Actual existing production @tester account (optional daily run):**
  `scripts/e2e/live-tester-workout-flow.cjs` signs in with a normal user
  email/password, verifies its profile username is exactly `tester`, then
  saves **one Quick Start mixed workout**, verifies retries and history, and
  deletes only the newly created history row matched by owner, random
  `client_save_id`, exact fixture notes and workout ID. Linked sets and PR
  rows cascade. A failed cleanup is a hard test failure. This workflow does
  not require admin or service-role credentials.

### Enable the real production tester workflow

The production tester account exists, but its password is intentionally not
available to CI. GitHub's connection does not allow this repository's workflow
secrets to be created from chat.

1. In [repository settings](https://github.com/MuscleMetric/musclemetric/settings/secrets/actions),
   add **Actions repository secrets** `E2E_TESTER_EMAIL` and
   `E2E_TESTER_PASSWORD` for the existing `tester` account. Never commit or
   send the password into a PR.
2. Run the workflow manually from
   [Live tester account E2E](https://github.com/MuscleMetric/musclemetric/actions/workflows/live-tester-e2e.yml)
   after this PR is merged. Check that it saves **and cleans up** the fixture.
3. In [Actions variables](https://github.com/MuscleMetric/musclemetric/settings/variables/actions),
   set `ENABLE_LIVE_TESTER_E2E=true` to activate its scheduled daily
   03:17 UTC run. Without the variable, the scheduled job is deliberately
   skipped; a manual dispatch still tries to run and fails explicitly if
   secrets are missing.

This separate live check is not yet part of the required `CI gate`. Do not
add a secret-dependent live account test to PR CI until the credential and
environment policy are settled. The **disposable tester E2E is required**
via the existing database job.

**Scope:** These tests exercise Supabase authentication + HTTP/RPC + history
rather than tapping through the Expo iOS UI. A device/simulator E2E suite is
a separate improvement.

## Next investments

- Add iOS simulator-level E2E for review screen -> save -> recent activity.
- Extend production contract checks to other release-critical RPCs *using safe
  probes tailored to each function*, not anonymous writes to arbitrary RPCs.
- Automate remote migration-inventory comparison after securely configuring a
  read-only credential. Never embed service-role or database credentials in
  Expo app builds.
- Introduce stable device E2E tests (e.g. Maestro or Detox) for review -> save
  -> recent activity -> analytics, plus a short post-release canary.

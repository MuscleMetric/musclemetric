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
3. **Database semantics:** CI starts a fresh Supabase instance, reapplies
   repository migrations and runs the database pgTAP suite (including V2
   permissions, cross-user rejection, and idempotency).
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

## Next investments

- Add an isolated E2E environment with a disposable authenticated test account
  that actually saves, reads back and cleans up a fixture workout.
- Extend production contract checks to other release-critical RPCs *using safe
  probes tailored to each function*, not anonymous writes to arbitrary RPCs.
- Automate remote migration-inventory comparison after securely configuring a
  read-only credential. Never embed service-role or database credentials in
  Expo app builds.
- Introduce stable device E2E tests (e.g. Maestro or Detox) for review -> save
  -> recent activity -> analytics, plus a short post-release canary.

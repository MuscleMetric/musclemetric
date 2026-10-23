# Production known-history E2E — three stages

## Release control

The new workflow runs only by manual dispatch until the repository Actions variable
ENABLE_PRODUCTION_FULL_E2E=true is explicitly enabled. Then it is scheduled at
04:13 UTC. It shares a concurrency lock with the existing 03:17 UTC live
production smoke test, which remains unchanged.

No migrations, schema changes, service-role keys or admin endpoints are used.
Both workflows use the existing tester's ordinary Auth email/password secrets.

## Stage 1 — Setup

Authenticate to the exact MuscleMetric production project and known tester ID.
Refuse to write when the user has any previous workout history, posts, plans,
goals or active plan. Snapshot their settings, weekly goal, notification count
and existing template IDs. Audit static app RPC availability.

Persist a random UUID run ID and a list of intended client_save_id values to
an on-runner manifest **before** calling workout-save RPCs, allowing recovery
from successful commits with lost responses.

Seed three workouts through the real save_completed_workout_v2 endpoint:
- Strength: 100 kg × 5 and 105 kg × 3 = 815 kg volume.
- Cardio: 5 km in 1800 seconds.
- Mixed: 50 kg × 8 and 3.2 km in 1200 seconds = 400 kg volume.

Expected: 3 sessions, 5 sets, 1215 kg volume, 8.2 km distance and 3000 s cardio.

## Stage 2 — Tests

Independently query live workout history, exercise history and set-history
tables as the tester. Calculate the expected totals and verify exact values
returned by progress, home, history feed/detail and deep cardio analytics.

Retry original save payloads and require the same workout IDs. Reject forged
user ownership and confirm that the denied call created no rows.

Use create_post_v2 to make one uniquely tagged PRIVATE workout post. Verify its
workout snapshot, details and own-post list; add a comment, like/unlike it, and
confirm an invalid linked workout is rejected with no write.

Save another 2 km/600-second run and verify changed totals: 4 sessions,
1215 kg, 10.2 km, 3600 seconds and 3 cardio sessions.

Create and edit a run-tagged plan with workouts/goals, reject forged ownership,
and verify authenticated read endpoints for home, progress, workout list,
profile, settings, exercise picker and plan session bootstrap.

These are representative business tests, not blanket execution of every
database function or Edge Function.

## Stage 3 — Cleanup

Always execute the cleanup step even if Setup or Tests fail.

Delete only run-tagged private posts, post children, plan clones, plans and
goal children, workout-history rows and their history children.

Resolve workouts by previously registered client_save_id and exact notes.
Resolve posts by exact private caption, plans by run-specific title, and
clones by their run-specific title suffix. Never delete unrelated test-account
history or the existing workout template.

Restore active_plan_id only if it refers to the current run's plan. Validate
that the profile settings, weekly goal, notification count, template IDs and
workout/post/plan/goal counts equal the initial snapshot. Fail on mismatch.

If a CI runner is forcibly terminated, cleanup may not complete. The next
run refuses to seed over leftover records; investigate any failure and
recover using the run UUID recorded in the Setup log.

## Safeguards and activation

The production write workflow does not run in pull_request CI.
After the user has reviewed and merged the PR themselves, dispatch a manual
run first. Verify the Cleanup stage is green before enabling the separate
ENABLE_PRODUCTION_FULL_E2E repository variable for unattended daily runs.

The existing narrower live production smoke test and disposable local CI tests
remain independent. This is real production API-level E2E, not iPhone
simulator-based UI automation. Eight dynamic RPC callsites, Edge Functions,
public social visibility and many other failure paths remain for later work.

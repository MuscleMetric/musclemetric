# MuscleMetric engineering refactor roadmap (October 2026)

Goal: strengthen the existing free consumer app before prioritising new app
feedback or building the Coach/PT extension.

## Foundations completed

- PR #40: protected CI and repository workflow (ESLint, TypeScript, Jest).
- PRs #42–43: reproducible Supabase backend and database behaviour contracts.
- PR #44: privileged RPC security hardening and notification job recovery.
- PR #45: broader database tests across workouts, plans, goals, social,
  notifications, achievements and feedback.
- PR #46: social feed post-detail interactions and targeted accessibility tests.

## Refactoring stages

### Stage 1 — PR #47: workout saving and logging

- Separate payload builders from the Supabase save transport.
- Preserve `save_completed_workout_v1` contract, owner checks and the
  `client_save_id` idempotency key.
- Preserve strength, cardio, Quick Start and plan-completion data.
- Keep unsynced workouts in the retry queue after all failure types.
- Add automated tests for success, error reporting, interruptions and retry.
- Validate on a physical iPhone before merge/release.

This is an incremental first pass, not a rewrite of live-workout screens or
every aspect of session lifecycle persistence.

### Stage 2 — proposed PR #48: frontend services, screens and hooks

- Move duplicated business logic out of oversized UI components.
- Keep rendering, state orchestration and Supabase access responsibilities
  separate.
- Focus regression tests on plans, goals, navigation and live-workout flows.
- Preserve the existing app UX unless a change is separately reviewed.

### Stage 3 — proposed PR #49: backend boundaries and security

- Classify remaining `SECURITY DEFINER` functions by intended caller.
- Tighten privileged operations without breaking legitimate signed-in RPCs.
- Test cross-user isolation, transaction rollback, retries and permissions.
- Keep schema changes additive with reviewed forward migrations.

## Ongoing test and release approach

- Each behavioural change and refactor gets focused tests in the same PR.
- The database behaviour coverage map lives at
  `docs/behaviour-contracts/coverage.md`.
- Run GitHub CI (ESLint, TypeScript, Jest and database baseline) before merging.
- Keep PRs incremental, and squash-merge after review and iPhone smoke tests.
- Merge to `main` does not itself ship a new App Store build.
- After stages 1–3, return to in-app feedback and prioritise the backlog.

Related tracked cleanup: Issue #17 (app stability and release readiness).

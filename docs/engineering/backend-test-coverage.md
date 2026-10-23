# MuscleMetric backend and screen test coverage

The **CI gate** runs after every pull request to `main`. Its disposable Supabase
instance applies repository migrations and creates an isolated authenticated
`tester` account. No production user or plan records are used in these jobs.

## Required checks

| Surface | Level | What is asserted |
| --- | --- | --- |
| Workout saving | Real local HTTP/Auth/RPC | Strength, cardio, mixed workouts; idempotent retries, sets, lifting volume and distance |
| Recent activity + history detail | Real local HTTP/Auth/RPC | Session appears exactly once, correct data and ownership |
| Cardio Deep Analytics | Local RPC and screen Jest | Logged cardio sessions/distance/time, cardio branch and error rendering; strength fallback |
| Workout Review | React Native component Jest | Save errors preserve draft, switched-account guard, no double submission, successful save exits review |
| Plans: create | Real local HTTP/Auth/RPC | Plan, linked workout, exercise prescription/targets, goal, active profile and owner checks |
| Plans: edit | Real local HTTP/Auth/RPC | Title, existing workout, added cardio workout, goal target and owner checks |
| Screen data | Real local authenticated RPC | Home, progress, workout list, profile, settings, exercise picker, workout bootstrap |
| Experience + Primary Goal settings | Real local HTTP/Auth/RPC | Approved values saved, other settings preserved, arbitrary keys refused |
| All statically named app RPCs | Local authenticated PostgREST OpenAPI | Every static `supabase.rpc("name")` call in app/lib resolves to a route. No calls executed for inventory. |
| Production workout saver | Live anonymous rejection | Verifies `save_completed_workout_v2` is deployed with correct permission behaviour |

The **optional daily production tester workflow** uses only the `tester`
account secrets. It is not run on pull requests, to prevent leaking credentials
to arbitrary PR code. It now checks a read-only production RPC catalogue *before*
writing any data, verifies a uniquely identified strength/cardio test workout
and confirms the cardio deep analytics RPC includes that session. All fixture
cleanup uses user ownership, an exact note marker and `client_save_id`.

## Limitations

- Scanning catches static named RPC calls, not dynamically constructed
  names, Edge Function invocations, direct table access or third-party APIs.
  Dynamic callsites are reported in the logs for review.
- OpenAPI proves the RPC route is visible to the authenticated account; it
  does not assert every parameter or result shape. Behavioural tests cover
  the most important functions instead.
- The component checks render selected React Native screens, but are **not**
  Maestro/Detox/XCUITest end-to-end simulator tests.
- The production workflow is scheduled independently from the required PR
  gate and can fail after a merge without blocking that historical merge.
- New migrations still must be deployed to production separately. **Do not
  assume a green local test means the live database has received migrations.**

## Known deployment blocker (23 October 2026)

The broad audit discovered that `set_profile_settings_v1` is called by
Experience and Primary Goal settings but is missing in the production
database. The PR contains an invoker-security, owner-scoped migration and a
regression test. The function was deployed to production as migration **20261023153517** and the production contract preflight passed after deployment.
Once deployed, verify it via authenticated read-only inventory before
shipping an app release. The daily production job will flag missing endpoints.

## Next coverage investments

1. Test all remaining dynamic RPC callsites with explicit resolved names.
2. Include direct-table CRUD, Edge Functions, and notification/push workflows
   in a catalogued service-level test matrix.
3. Add a real iOS simulator flow for starting a workout, entering sets,
   reviewing/saving and opening history and deep analytics.
4. Add full UI automation for plan creation and editing (including offline,
   error and duplicate-press behaviour).

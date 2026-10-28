# Native frontend suite

The first Maestro suite runs a standalone Android build on an emulator against a disposable local Supabase database. It never targets production. Its six results appear in Allure under **Native frontend — Android / First user journeys**.

| Journey | UI assertions and persisted outcome |
| --- | --- |
| Authentication | Real local Auth login, session survives relaunch, logout returns to login, invalid credentials stay rejected |
| Workout | Enter 50 kg × 10 reps, save through review, open history and see 500 kg; backend verifies exactly one workout and set |
| Progress | Two seeded runs total 5 km, 25 minutes, 5:00/km; assert those values on the cardio screen |
| Plans | Create a plan from a fixture template, edit its title, reopen and verify persistence |
| Recovery | Log a set, stop the app, stop only the disposable API, reopen offline, recover the same values, reconnect and save once |
| Social privacy | Owner sees public and private captions; a different signed-in account sees only the public caption |

Fixture records are created with admin credentials only in the host-side setup script. The app receives the disposable public key and signs in using ordinary authenticated sessions. Tests use separate accounts for each journey. `EXPO_PUBLIC_NATIVE_E2E=true` selects a distinct test app ID and enables a password form on the login screen; config/runtime guards reject non-local databases. Normal builds retain Google/Apple login. Provider-owned OAuth screens are outside this suite.

## Running and reporting

Run **Native frontend E2E (Maestro)** in GitHub Actions, or run the full **Production deterministic history E2E** workflow. The latter waits for native, database and production jobs and merges all raw Allure results. Unzip the report artifact and open `index.html`. Native failures attach captured screenshots when available and sanitised diagnostics. A build/emulator/setup failure creates a broken suite result with all unexecuted journeys skipped; it never fabricates passing UI coverage.

The workflow generates Android project files from Expo, builds the standalone APK, installs Maestro CLI 2.12.0 and runs the six journeys sequentially. The native build can take significantly longer than backend checks. Credentials and fixture manifests are never uploaded. The database is destroyed after the job, even on test failure.

For local development, use the same environment and commands from `.github/workflows/native-frontend.yml`. `API_URL` must point at localhost for the host-side scripts; Android accesses the host via `EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321`. Use the local Supabase anon key for `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Do not substitute production credentials or endpoints.

## Scope

This first runner validates Android, not iOS. An iOS simulator build and runner are still needed to claim iPhone coverage. Native push delivery, Apple/Google provider UI, OS background eviction and Live Activities remain outside these six flows. Deep links enter the real feature screens where practical; they do not replace screen code or saving logic. Full tab-to-screen navigation coverage can be expanded separately.

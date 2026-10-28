# Native frontend suite

The first Maestro suite runs a standalone iOS Simulator build on a hosted Mac against a dedicated, non-production Supabase test branch. It never targets production. Its six results appear in Allure under **Native frontend — iOS / First user journeys**.

| Journey | UI assertions and persisted outcome |
| --- | --- |
| Authentication | Real local Auth login, session survives relaunch, logout returns to login, invalid credentials stay rejected |
| Workout | Enter 50 kg × 10 reps, save through review, open history and see 500 kg; backend verifies exactly one workout and set |
| Progress | Two seeded runs total 5 km, 25 minutes, 5:00/km; assert those values on the cardio screen |
| Plans | Create a plan from a fixture template, edit its title, reopen and verify persistence |
| Recovery | Log a set, stop the app, stop only the disposable API, reopen offline, recover the same values, reconnect and save once |
| Social privacy | Owner sees public and private captions; a different signed-in account sees only the public caption |

Fixture records are created with admin credentials only in host-side fixture setup and cleanup. The app uses a loopback-only proxy that supplies the test branch public key and signs in using ordinary authenticated sessions. Tests use separate accounts for each journey. `EXPO_PUBLIC_NATIVE_E2E=true` selects a distinct test app ID and enables a password form on the login screen; config/runtime guards reject non-the local proxy. Normal builds retain Google/Apple login. Provider-owned OAuth screens are outside this suite.

## Running and reporting

Run **Native frontend E2E (Maestro)** in GitHub Actions, or run the full **Production deterministic history E2E** workflow. The latter waits for native, database and production jobs and merges all raw Allure results. Unzip the report artifact and open `index.html`. Native failures attach captured screenshots when available and sanitised diagnostics. A build/simulator/setup failure creates a broken suite result with all unexecuted journeys skipped; it never fabricates passing UI coverage.

The workflow builds the checked-in iOS workspace for the Simulator without signing, retaining its native targets. It changes bundle identifiers only in the CI checkout, installs Maestro CLI 2.12.0 and runs the six journeys sequentially. Test screenshots and sanitised failure diagnostics are attached to Allure. The build can take substantially longer than backend tests.

## Hosted test backend setup

GitHub-hosted Macs cannot run the Docker-based local Supabase stack. Configure a separate Supabase development branch with the current application schema, then set these GitHub Actions entries:

- Variable `NATIVE_E2E_PROJECT_REF`: the test branch project ref.
- Secret `NATIVE_E2E_ANON_KEY`: the test branch anon/public API key.
- Secret `NATIVE_E2E_SERVICE_ROLE_KEY`: the test branch service-role key (host-side fixture setup/cleanup only).

The loopback proxy rejects the production project ref and restricts forwarding to Auth and REST paths on the exact configured Supabase hostname. It never places a service-role key in the app bundle. The app connects to `http://127.0.0.1:54321` using a placeholder public key; the proxy supplies the branch public key. The recovery test toggles a local 503 response, without stopping the hosted database.

Accounts have unique random credentials per run. Cleanup deletes only the accounts and exercises recorded in that run's manifest, including partial setup failures. Credentials/manifests are never uploaded. A hard runner termination can prevent cleanup; the dedicated branch must contain no production data and can be reset separately when no tests are running. Branch compute charges apply while it exists.

## Scope

Apple/iOS execution only; no Android build or runner is added. The first suite does not automate provider-owned Apple/Google sign-in screens, native push delivery, OS background eviction, Live Activities, or realtime WebSocket delivery. Deep links enter real feature screens where practical; no alternate save logic is introduced. Physical iPhone checks remain useful for hardware and OS-specific behaviour.

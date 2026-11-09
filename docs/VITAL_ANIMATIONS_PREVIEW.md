# Vital Animations — isolated iOS proof of concept

Branch: feature/vital-animations-preview
Route: /features/workouts/animation-preview (visible on the Workout tab)
Status: UI and importer implemented; the user-supplied 272 MB ZIP was inspected and the importer adjusted for its real structure. Native iOS playback remains to be tested on device.

## Safety contract
- Existing production exercise IDs, exercise-musclegroup assignments, workouts, history, RPCs and policies are unchanged.
- The preview only executes SELECT id,name,equipment,type FROM public.exercises WHERE is_public=true LIMIT 700 under the signed-in user's RLS.
- All animation metadata and MP4 assets remain **local on device** for the proof of concept.
- No new persistent tables, storage buckets, migrations or RLS policies.
- Never upload licensed media to a public repository or expose a raw media download API.
- Supabase sandbox SQL uses CREATE TEMP TABLE inside BEGIN...ROLLBACK only.

## Setup on a Mac for iPhone preview
1. Check out branch:
   git fetch origin
   git switch feature/vital-animations-preview
2. Install dependencies:
   npm install
   npx expo install --check
3. Inspect ZIP without extracting:
   python3 scripts/import_vital_free_pack.py ~/Downloads/YOUR_FREE_PACK.zip --inspect
4. Import known MP4s and generate the local-only manifest:
   python3 scripts/import_vital_free_pack.py ~/Downloads/YOUR_FREE_PACK.zip
   The importer selects eight sample exercises (0051, 0054, 0057, 0060, 0073, 0074, 0087, 0098), approximately 35 MiB.
5. Run tests:
   npm run typecheck
   npx jest __tests__/vitalPreview/matching.test.ts --runInBand
   python3 -m unittest discover -s scripts -p 'test_vital_free_pack.py'
6. Connect the iPhone by USB-C and rebuild the development app: expo-video is a native module.
   npx expo run:ios --device
   (For later JavaScript-only iterations, npx expo start --dev-client is sufficient.)
7. In the Workout tab, tap "EXPERIMENTAL · Exercise animation preview".

## Test checklist
- Dark and light theme layout and scroll behaviour.
- Looping clips have no audio and do not cover workout controls.
- Tap a different exercise; player changes to that clip without leaking players.
- Search sample metadata.
- Database counts stay identical; no new workout is logged.
- Exercise matching is exact/conservative; ambiguous names get no automatic ID mapping.
- No media is available: an explicit explanatory empty state appears.
- In the "App placement" tab, review exercise picker, overview and live-workout proposals.

## Known blockers / review notes
- The ZIP is now available and inspected. It contains 50 Free50 MP4s + 50 JSON records, plus 11 extra character sample videos. The importer explicitly prefers the Free50 paths for duplicate IDs 0051 and 0098.
- The real metadata contains id (not exerciseId), and description is a string. These are supported by the importer.
- Import defaults to eight deliberately chosen clips (about 35 MiB) with 80 MB per-file and 250 MB total upper limits. The 0057 animation appears to show bench press despite being labelled hip thrust; it is explicitly flagged.
- MP4 media must not be added to the public repo. The local-generated manifest requires locally available files; the branch's tracked manifest remains empty.
- The frontend reads the production catalogue only. This does not yet implement a persistent exercise-animation mapping or production UI rollout.
- Verify native expo-video installation in the iOS development build (this branch uses Expo SDK 54 compatible 3.x).
- Run database safety counts before and after (scripts/vital_preview_sandbox.sql).
- Obtain and retain the free-pack specific terms before any public release.

## Expected eventual architecture
- Keep public.exercises.id UUIDs unchanged.
- Add a separate source mapping table after manual match review (not included in this POC).
- Store licensed assets in private Supabase Storage and serve only via authenticated scoped URLs.
- Add optional display components to exercise picker / overview / live workout separately after QA.

# Vital Animations — isolated iOS proof of concept

Branch: feature/vital-animations-preview
Route: /features/workouts/animation-preview (visible on the Workout tab)
Status: UI/code implemented; actual sample ZIP still needs to be available to the importer.

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
   If no clips are matched automatically, supply a JSON file mapping exercise IDs to MP4 file names:
   python3 scripts/import_vital_free_pack.py ~/Downloads/YOUR_FREE_PACK.zip --mapping ./vital-map.json
5. Run tests:
   npm run typecheck
   npx jest __tests__/vitalPreview/matching.test.ts --runInBand
6. Connect the iPhone by USB-C and start your usual Expo iOS development-client workflow.
   npx expo start --dev-client
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
- Media ZIP must actually be present to test animations. The free-pack URL advertises downloadable media, but a ZIP has not been accessible from the current session.
- The parser accepts an array or {exercises:[...]} / {data:[...]} / {items:[...]} / {results:[...]} / id-keyed JSON objects. If the free pack uses another shape, inspect it and adapt the parser.
- Import limits: 20 clips, 80 MB per file, 250 MB total to keep device tests bounded.
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

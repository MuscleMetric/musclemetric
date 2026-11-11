# Vital Animations — iOS workout integration preview

Branch: `feature/vital-animations-preview` · base: `main`

## Original gallery scope
- The Workouts tab includes a new **Experimental · Exercise animation preview** link.
- The preview gallery shows locally packaged looped MP4 demos, supplied instructions, equipment and muscle information.
- **Try in a workout** explains the integration enabled on this branch.
- A single read-only SELECT fetches up to 700 public exercise IDs/names/equipment/type for a conservative name match.
- No writes to public.exercises, public.exercise_muscles or workout history; no new live database table is required for the app.
- Gallery name matches are informational. Workout integration uses an explicit local UUID-to-sample map; no database mappings are written.

## Supplied source pack: actual ZIP schema
The free pack contains `VitalAnimations/Free50/50gymworkouts.json` and 50 matching MP4s in `Free50/Free50/`.
JSON uses `id` (not the README's `exerciseId`) and a string `description`.
Separate Character Samples folders contain 11 additional video files without the same metadata.
The selected 10 samples are IDs 0051, 0054, 0057, 0060, 0064, 0068, 0074, 0085, 0088 and 0099.
Their files are 1080 × 1080 H.264 MP4 with white backgrounds. Use a white viewing surface.

## Testing on an iPhone, using the private 10-clip test ZIP
1. On your Mac: `git fetch origin && git switch feature/vital-animations-preview && git pull`.
2. Download `MuscleMetric_Vital_Animations_Test_Assets.zip` from the ChatGPT conversation.
3. Extract that ZIP into the **root of your local Git repository** (the ZIP has `assets/vital-preview/` paths). Confirm `assets/vital-preview/0054.mp4` exists.
4. Run `npm install` to install `expo-video`, then `npx expo run:ios --device` (with iPhone connected). Expo dev clients need to be rebuilt for a new native dependency. If necessary, first run `npx pod-install`.
5. Open the **Workouts** tab and tap **Experimental · Exercise animation preview**.
6. Check looping, scrolling, dark mode, memory and playback, and **App placement**. No workout save is needed.

Alternative: from your original supplied VitalAnimations ZIP, use the local installer:
```bash
node scripts/install-vital-preview.cjs "/path/to/VitalAnimations.zip"
# or, to include all 50 free gym clips (larger bundle):
node scripts/install-vital-preview.cjs "/path/to/VitalAnimations.zip" --all
```

## Tests
```bash
npm install
npm run typecheck
npm test -- --runInBand __tests__/vitalPreview/matching.test.ts
npx eslint app/features/workouts/animation-preview.tsx features/vitalPreview/ assets/vital-preview/manifest.ts
```

## Safety / licence
- Supplier README advertises permission to use the free pack in applications under commercial licence conditions. Retain the supplier licence / purchase page for audit.
- **Do not commit the sample MP4s or generated manifest** to public GitHub, or expose the original ZIP / raw media catalogue through a public API.
- In the connected Supabase project a prior read-only transaction created a TEMP table, SELECTed its rows and ran ROLLBACK. The exercise catalogue was not updated.
- The preview has **no INSERT, UPDATE, DELETE, RPC or Storage upload**.
- Production integration would use a separate mapping table and controlled asset hosting only after licensing, UX and matching review.
- Do not merge this proof of concept to main until mobile playback and CI checks pass.

## Limitations
- The clips are not in the public GitHub branch by design. A clone will show a clearly labelled empty-state until the private pack is locally installed.
- Video quality has been inspected from the uploaded file but **not run on an iPhone from this environment**.
- No release build / TestFlight submission has been made.

## Workout integration — 11 November 2026

The same private 10-clip test ZIP works; no new download or database change is needed. Nine movements are enabled against 11 existing catalogue IDs. Clip 0057 is excluded from both gallery and workout integration because its footage shows bench press while metadata says hip thrust. It is also excluded for older manifests without qualityNote.

Supported samples: Pec Deck Fly, Back Squat, Romanian Deadlift (barbell), Goblet Squat, Hack Squat, Leg Press / Leg Press (45° Sled), Triceps Rope Pushdown / Cable Rope Pushdown, Overhead Press (standing barbell), Rear Delt Machine Fly. Missing sample assets or unknown/private exercise IDs show the ordinary UI without a demo control. No fuzzy name matching runs in the workout flow.

### Test on your phone

Keep the existing `assets/vital-preview/manifest.ts` and MP4s from the private ZIP. From the repository root:

```bash
git fetch origin
git switch feature/vital-animations-preview
git pull --ff-only
npm install
npx expo run:ios --device
```

1. Start a normal workout or Quick Start. Use **Add exercises → With demos**. Preview a thumbnail, close it, select Back Squat and Romanian Deadlift, and confirm. Filtering must preserve other selected exercises.
2. In the live list tap the thumbnail to preview, or the title/Start button to enter sets. Log a set, open **Watch demo**, change speed, pause/replay, close, and confirm the entered values are unchanged.
3. Add or replace another exercise. Previewing must not select it, submit the picker or change the current workout. Already-in-workout exercises can still be previewed.
4. Open a saved workout before starting. This is the **workout overview**: cover, title, stats, goals, exercise list and Start workout. Tap a supported exercise, then Watch demo in its existing detail sheet.
5. Check dark mode, smaller phone sizes, large text, silent playback while music plays, background/foreground and Reduce Motion. Videos pause when backgrounded; press play to resume. Reduced Motion starts paused.
6. Finish or discard the session normally. **This is the real workout flow:** completing a workout saves it using the existing app behaviour. Watching a demo does not save anything.

### Implementation and validation

- Shared demo sheet with square white player, pause/replay, 0.5×/1× speeds and supplied instructions.
- List images are cached stills extracted sequentially from local clips, not looping list players. Thumbnail extraction failure falls back to a play badge.
- Player exists only while its sheet is open. Its lifecycle is independent of the workout draft and timer.
- Live add/replace picker includes With demos; the separate workout-template creation picker has not been redesigned.
- No raw media or generated manifest is committed. The original ZIP remains usable.
- Automated mapping, preview interaction, picker selection and live-workout regressions are run locally, along with TypeScript, scoped lint and an iOS Metro export with the private assets. Native playback and layout still require the iPhone test above; a Metro export is not a native iOS build.

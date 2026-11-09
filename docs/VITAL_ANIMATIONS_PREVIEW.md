# Vital Animations — isolated iOS evaluation

Branch: `feature/vital-animations-preview` · base: `main`

## Scope
- The Workouts tab includes a new **Experimental · Exercise animation preview** link.
- The preview gallery shows locally packaged looped MP4 demos, supplied instructions, equipment and muscle information.
- **App placement** documents potential integration points (exercise picker, workout overview, live workout) without enabling them.
- A single read-only SELECT fetches up to 700 public exercise IDs/names/equipment/type for a conservative name match.
- No writes to public.exercises, public.exercise_muscles or workout history; no new live database table is required for the app.
- There is no animation attached to an existing exercise UUID. Matches are only displayed as preview labels.

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

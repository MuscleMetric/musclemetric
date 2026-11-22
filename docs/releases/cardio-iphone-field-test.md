# Outdoor Run on iPhone

From the MuscleMetric checkout on a Mac with Xcode signing already set up for the connected iPhone, install the field-test branch. The Release configuration embeds the JavaScript bundle so the phone can leave the Mac and Wi-Fi behind.

```sh
git fetch origin
git switch feature/cardio-1-1-data-foundations
git pull --ff-only
npm ci
npx pod-install ios
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release --device
```

Sign in while connected. Start a planned workout containing **Outdoor Run**, or use **Quick Start Workout** and add the exercise. Tap **Start** on the exercise row outdoors, grant precise location and choose Always for locked-screen recording. If iOS only offers While Using or you previously chose Allow Once, use Settings → Apps → MuscleMetric → Location → Always, enable Precise Location and retry.

Before Wednesday, walk a short loop. Wait until the full-screen current pace has a value, lock the phone for one minute, reopen and check that distance increased. Pause and walk a little, verify distance stays fixed, then resume. Tap **Pause → Finish exercise**, choose the run type, and tap **Save set and return to workout**. Complete and save the parent workout from Review. Effort is optional. Check the route, the partial split and one workout-history entry. For the Wednesday run, crossing 1 km should produce a full split plus any remaining distance. Split pace uses the active timer, and the map breaks across pauses or signal gaps. A continuous GPS best never spans a gap.

For offline validation, turn off data after signing in and repeat. The completed route and splits stay on the iPhone. Reconnect and reopen the app with the same account to retry the upload. Reopening the recorder lists completed local runs. If the app is terminated, reopen it with the same account and review the draft. Distance travelled while location updates were interrupted cannot be recovered. Do not uninstall before reviewing the run.

Normal workout history and Deep Analytics receive one Outdoor Run entry with distance in kilometres and active time. New recordings automatically sync private routes and splits. Open the workout in history to see the map, active pace and measured splits. Precise detail is readable for 90 days from recording start. An hourly job removes expired rows, and the app clears expired local samples when next open. Workout-history totals remain. Runs started on the older build retain their manual backup choice. Progress → Running progress shows GPS records for the runs stored on this device.

Before release, record the iPhone model, iOS version, start/end battery, screen-lock duration, measured distance versus a known route, and whether the run survived an offline finish. Verify denied permission, account switching, and a second-device private restore after the reviewed migrations are deployed. Share numerical results without private route screenshots.

# Cardio Deep Analytics

Cardio exercises now have a dedicated view instead of empty strength charts.
The existing get_exercise_deep_analytics RPC retains its strength payload and
adds meta.exercise_type and an optional cardio section for new clients.

## Metrics

- Sessions, distance and recorded exercise time over the last 365 days.
- Longest session by logged distance.
- Distance-weighted average pace from entries containing both positive distance
  and positive time: total paired seconds / total paired kilometres.
- Latest session, distance/time/pace charts, and recent session history (last 12).
- Logged sets are grouped by workout history ID. Multiple intervals become one
  session; separately incomplete distance/time entries do not fabricate a pace.
- Time-only and distance-only sessions remain visible; missing metrics show a dash.
- No e1RM, lifting-volume charts or strength formulas appear for cardio.

No GPS, terrain, heart-rate or effort data is assumed, and pace changes are not
presented as proof of improved fitness. Distance is stored in kilometres, time in
seconds. Account ownership is enforced in the RPC using auth.uid(); the existing
strength path and auth guard remain intact. Null exercise types default to strength.

## Deployment / phone review

The cardio post-summary migration from #53 was deployed to production on
16 October 2026 as migration version 20261016220107. Its filename is aligned to
that live version in this PR; the SQL content is unchanged. Live verification
returned Tempo Run snapshots with 5 km and 1440 seconds of logged cardio time.

The NEW cardio analytics migration is NOT deployed by this PR. Apply it before
releasing the new analytics client. Existing clients ignore the new optional
cardio data; old strength JSON fields remain present for compatibility.

On iPhone, review Outdoor Run with existing history, a time-only session, an
interval session and an empty exercise. Compare totals with saved entries. Check
portrait layout, horizontal chart scrolling, large text, dark mode, refresh and
back navigation. Strength charts must remain available for strength exercises.

# Cardio workout post summaries

Feedback: 63e2d2d7-37c4-4f8e-874a-e41b30a09406.

A run previously showed VOLUME 0 kg. Workout cards now select their summary using
recorded exercise types, rather than treating every zero-volume workout as cardio.

- Cardio: DISTANCE 5 km / TIME 25:00 / EXERCISES 1.
- Strength: VOLUME 8,500 kg / SETS 18 / EXERCISES 6 (existing layout).
- Mixed: VOLUME 1,000 kg / DISTANCE 2 km / TIME 10:00.

Distance totals positive logged cardio set distances (stored in kilometres).
Time totals positive logged cardio intervals, with session elapsed duration as a
fallback when interval time is absent. Missing distance/time displays a dash.
Older backend snapshots retain the strength layout until the migration is applied.

The additive migration updates get_feed, get_post_detail_v1 and
get_profile_overview_v1 so feed/detail/profile cards agree, including old posts
hydrated from saved workout history. No saved workout data is rewritten.
RPC return signatures and existing visibility/block filters are retained.

Release order: apply and verify the migration before distributing the app UI.
Old apps ignore the new JSON fields. This PR does not deploy production changes
or publish an app. Physical iPhone review should cover a run, time-only cardio,
strength and mixed sessions in feed, details and profile; verify like/comment
and post-opening actions, long durations and large font sizes.

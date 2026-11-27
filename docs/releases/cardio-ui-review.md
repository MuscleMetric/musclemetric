# Cardio UI review

Start on the Progress tab of the iPhone cardio build. Review one item at a time. Tick it after Harry approves the behaviour on device. For an issue, add the observed behaviour and desired change beneath that item, then retest it after the fix. The items below are review criteria.

## At the desk with Fast Refresh

- [ ] **1. Progress → Running highlights.** Before tapping, can you tell which distance each time belongs to and recognise an empty record? Tap a populated tile and an empty tile if available. Both should open Running progress. Back should take you to Progress.
- [ ] **2. Running personal bests.** Read a time, distance, date and GPS or Logged source together. Open a populated record and confirm it takes you to the workout that earned it. Check whether the horizontal row makes the remaining distances discoverable.
- [ ] **3. Progress by run type.** Switch between All and a type used in the past 90 days. Unused types should stay hidden. Check whether the selected filter is obvious and whether it includes the expected runs.
- [ ] **4. Trend chart.** Switch between distance, active time and average pace. Read the numbers and units on the vertical axis. Today belongs on the right. Faster pace, longer duration and greater distance should each plot higher. Check chart height and label readability on the phone.
- [ ] **5. Selected run beneath the graph.** Tap an older point. Identify its date, distance, time and average pace. Check whether the separate latest-run figure could be mistaken for the selected run. Open workout details and confirm the date matches.
- [ ] **6. Home distance trend and exercise Deep Analytics.** Compare the distance and pace shown for the same activity and date range. Check that manual and GPS history count once and that Home refreshes after a save.
- [ ] **7. Workout History.** Open the 2.24 km Easy walk logged as Outdoor Run. Find 27:22 active, 40:09 elapsed and 12:12/km average. Check the map, the two full-kilometre splits and the final 0.24 km. Review the summary-only view for an expired route when a fixture is available.
- [ ] **8. Starting an outdoor exercise.** Use a planned workout or Quick Start. Find Outdoor Run, read what Start does, and open the recorder. Review the permission prompt, the poor-signal state and the manual logging fallback.
- [ ] **9. Finishing and saving.** Pause, choose the run type, optionally enter effort and return to the workout. Check the measured set, workout review and saved confirmation. A mixed session should keep its lifting sets and produce one workout history entry.
- [ ] **10. Manual and treadmill runs.** Enter minutes, seconds, distance and run type. Check that a treadmill workout appears under the right filter and that its stats and record source are clear.

## On a short outdoor test with the Release build

- [ ] **11. Full-screen recorder.** Read active time at the top, current pace in the middle and distance at the bottom while moving. Slow down, pause and resume. Check that the display and controls make each state clear.
- [ ] **12. Lock Screen Live Activity.** Check MuscleMetric at top left and the activity icon and name at top right. Read the three values across the second row. Lock, pause, resume and return to the same workout.
- [ ] **13. Offline and interrupted recording.** Finish a short test without data, reconnect and reopen. Confirm one saved workout and one matching route with splits. Check that the UI explains when a save is pending, what can be retried and what survived an interruption.

## Review notes

First item awaiting feedback: **1. Running highlights**. Record feedback by item number so a revision can be picked up on the same screen.

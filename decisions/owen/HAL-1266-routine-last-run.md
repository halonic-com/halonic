# Decision: a failed last-run store is not a failed start, and removed routines lose their last run

- Requirement: `app.workspace-routines` (`packages/core/app/requirements/workspace-routines.md`)
- Task: HAL-1266, the two follow-ups from the review of PR #315 (HAL-957)
- Approval: the task asks for both changes; the maintainer approves this note in review

## What changes

The requirement gains two sentences and two examples. Nothing it promised before is taken away.

- A run that started but whose due time could not be stored as the routine's last run is now
  reported in `started` and in the new `lastRunNotSaved`, no longer in `failed`. Before, a retry
  after such a report looked like a second start, though the run id kept it single.
- The scheduler deletes the last run of a routine that is no longer among the workspace's routines.
  `Coordination` can't list its keys, so the scheduler keeps an index of the routines whose last run
  it may have stored (`routines/<workspace hash>/last-run-keys`). A routine that is only turned off
  keeps its last run. Last runs stored before this change, of routines already removed, are not in
  the index and stay.

## Tests

No test was weakened or removed. The tests that build a `RoutineScheduler` by hand now pass the new
`keyOf` option. New tests cover both changes in `routine-last-runs.test.ts` and
`workspace-routines.test.ts`.

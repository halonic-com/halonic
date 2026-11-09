# Decision: routine runs that are still going hold back their routine

- Requirements: `app.routine-scheduler` (`packages/core/app/requirements/routine-scheduler.md`),
  `app.workspace-routines` (`packages/core/app/requirements/workspace-routines.md`)
- Task: HAL-1007, from the `dueRoutines` mapping in the review of HAL-913 (PR #287)
- Approval: the task asks for the overlap rules; the maintainer approves this note in review

## What changes

The scheduler now applies each routine's `overlap` setting (new requirement
`app.routine-overlap`). Two existing examples change with it; nothing else they promised is taken away.

- `app.routine-scheduler`, "the last tick was not stored": a start whose run has ended still
  repeats with the same run id, and the executor still returns the run that exists. A run that is
  still going is no longer asked for again, because under `skip` or `queue` its own run would
  otherwise make the routine skip or queue that very time.
- `app.workspace-routines`, "`catchUp: all` with three missed hours": the example now says the
  routine has `overlap: allow`. With the default `skip` it starts one run and skips the others,
  as the old `dueRoutines` did.

## Tests

No test was weakened. The tests behind these examples now end the earlier run first, as a real run
would, or set `overlap: allow`, so they still check the same promise. The "still going" case has a
new test in `routine-scheduler.test.ts`; the overlap rules have their own tests under
`app.routine-overlap`.

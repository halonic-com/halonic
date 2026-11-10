# Decision: removed routines' values are deleted with retries, and queued times start without `catchUp`

- Approval: asked for by the package owner (Liam) in his review of #1102, points 3 and 4 of [HAL-3713](/HAL/issues/HAL-3713); he approves this note in review
- Kind: internal
- Task: HAL-3713

## What changes

- `app.skip-records`: deleting a removed routine's rows now reads them again and retries, up to
  three times, as adding rows already did.
- `app.workspace-routines`: the same for a removed routine's last run. If a delete still loses
  after three tries, the routine stays in the last-run index, so the next tick tries again.
- `app.scheduler-keeps-skips`: says that a due time the overlap rule queued starts later without
  `catchUp`, with an example.

## Why

Before, a lost compare-and-set left the rows, and nothing deleted them later: `forgetRemoved`
had already stored the index without the routine. The comment "the next removal check deletes
them" was wrong. The two new tests fail before the change and pass after it.

For queued catch-up times I chose to write the limit down rather than keep the flag in the queue.
The stored queue is a list of due times per routine, sized to fit a `Coordination` value;
keeping the flag would change that format and its size budget. Most queued catch-up times would
only carry `skipped: 0`, since only the first run of a catch-up carries the count. When that first
run is itself queued (an earlier run is still going), its count is missing from the trigger, but
the skip records still hold it, and those are what the Runs view reads. A new test pins the
behaviour.

No test was weakened or removed.

## Covers

- app.skip-records
- app.workspace-routines
- app.scheduler-keeps-skips

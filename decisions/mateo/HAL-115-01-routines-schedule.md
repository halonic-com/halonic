# Decision: nextRun gives the interval slot due starts, in the policy zone

- Requirement: `routines.next-run` (`packages/core/routines/requirements/next-run.md`)
- Task: HAL-1093, part of HAL-115, from Liam's review of PR #287 (must fix 2)
- Approval: the review asks for this change; the maintainer approves it in review

## What changes

For an `every` trigger, `nextRun` used to answer one interval after the last run, or the moment
itself when the routine never ran or was overdue. It now answers the next slot counted from the
Unix epoch, strictly after the moment, whatever the last run was. Its `lastRun` parameter is gone.
In its place, `nextRun` takes the zone for a schedule that names none (UTC by default), and an
unknown zone throws a `CronError` instead of a `RangeError`.

The three old interval tests ("never ran", "one interval after the last run", "overdue") are
replaced by tests for the epoch slot, one that checks `nextRun` and `due` give the same time, one
for the zone fallback and one for an unknown zone. The schedule and non-clock tests stay as they were.

## Why

`due` starts interval runs on epoch slots, so they come out the same on every tick. `nextRun`
still counted from the last run, so the two disagreed: with `every: "30m"` and a run at 09:45,
`nextRun` said 10:15 while `due` started the run at 10:00. A next run shown to a person has to be
the run that actually starts.

The zone fallback had the same kind of gap: for a schedule without a zone, `due` used the
policy's zone but `nextRun` used the machine's. Core can't read the machine's zone, so both now
take it from the caller.

Overdue routines are no longer `nextRun`'s concern; `catchUp` decides in `due` what an overdue
routine runs. The allowed-differences entry for interval slots against the old package is
tracked in HAL-1007.

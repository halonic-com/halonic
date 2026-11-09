# Decision: occurrences takes the policy zone too

- Requirement: `routines.occurrences` (`packages/core/routines/requirements/occurrences.md`)
- Task: HAL-1007, from Liam's decisions on the review of PR #287 (point 2: "pass the same zone to both")
- Approval: the review asks for this change; the maintainer approves it in review

## What changes

For a schedule that names no zone, `occurrences` used the machine's zone. It now takes an optional
`timeZone` after `limit` (UTC by default), as `nextRun` does, and an unknown zone throws a
`CronError` instead of a `RangeError`. The existing tests stay as they were; two are added, for
the zone fallback and for an unknown zone.

## Why

`due` already passes its policy zone to `occurrences` by filling in the trigger's zone, so the tick
was right. A caller that lists times to show them, such as the Studio, called `occurrences` with
the trigger as written and got times in the machine's zone, which can differ from the runs the
tick starts. Core can't read the machine's zone, so the caller passes it.

# Decision: the row's sentence ties the schedule's time to the schedule

- Approval: small wording on approved mc 19.3, the team's call under HAL-2282; Sofia OK on
  [HAL-7142](/HAL/issues/HAL-7142) (12 Nov) with this change. Liam approves this note in review
- Kind: internal

## What changes

A run its routine's schedule started now has the sentence "… Started by the schedule for weekdays
at 08:00, 10:40." in place of "… Started by the schedule, weekdays at 08:00, 10:40.". The
requirement's example and the two tests that check that sentence change with it. The Started by
column still reads "Schedule · weekdays at 08:00", and the other eight spoken words stay as
`decisions/elena/HAL-7094-runs-started-by.md` has them; Sofia said OK to those as written.

## Why

Spoken with two commas, the sentence gives two times one after the other, and a listener can't
tell which one is the start. "for" ties the schedule's time to the schedule and leaves one comma
before the start time, so 10:40 stays the clear end of the sentence (Sofia, HAL-7142).

## Covers

- runs.row-columns
- packages/studio/features/runs/src/list/run-row.test.ts
- packages/studio/features/runs/src/ui/runs-page.test.tsx

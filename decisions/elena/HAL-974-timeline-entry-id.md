# Decision: add `entry` to the run log base fields

- Requirement: `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`)
- Task: HAL-974, from the spec "Run events: the timeline entry id" on HAL-970
- Approval: the spec asks for this field; the package owner (Liam) approves it in review

## What changes

The type test "gives every event the reference base fields" in
`packages/core/events/src/run-event.test.ts` now expects one more optional field
on `RunEventBase`: `entry?: number`. Nothing is renamed or removed, and every
reference event type and field stays as it was.

## Why

The live run timeline keys its rows by entry, never by index, so a row that
changes in place keeps its focus (accessibility check L7 on HAL-966). The run
log rule allows new optional fields that come with a requirement; this one comes
with `events.timeline-entry-id`. Logs written before the field existed still
read the same, and `entryOf` gives them the same entries.

No test was weakened.

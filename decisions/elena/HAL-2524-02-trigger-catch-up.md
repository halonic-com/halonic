# Decision: `trigger.catchUp` on a run's trigger

- Approval: the flag was agreed for Studio on [HAL-540](/HAL/issues/HAL-540), and what it counts on [HAL-2542](/HAL/issues/HAL-2542) (section 4 of the skipped-and-catch-up document on HAL-2538); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-2524

## What changes

`RunTrigger` gains one optional field, `catchUp: { skipped, countIsMinimum? }` (type `RunCatchUp`).
Nothing is renamed or removed. The `events.run-log-contract` type test that pins `RunTrigger`
gains the field, marked as added after the reference.

## Why

Studio shows "Caught up after sleep" and "61 earlier times were skipped" from the run itself.
Today it would have to compare `trigger.at` with the start time; the routine scheduler knows the
grace and what its catch-up rule dropped, so it sets the flag once and Studio reads it. The
scheduler sets it in a later pull request of HAL-2524. Older logs have no `catchUp` and read as
runs that started on time.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.trigger-catch-up
- packages/core/events/src/run-event.test.ts

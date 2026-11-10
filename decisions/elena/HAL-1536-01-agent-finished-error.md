# Decision: `agent.finished.error` and `reason`

- Approval: the parallel state is step 5(b) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), approved by Liam on [HAL-1515](/HAL/issues/HAL-1515); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1536

## What changes

`agent.finished` gains two optional fields, `error` (a message) and `reason` (a `RunFailureReason`).
Nothing is renamed or removed. The `events.run-log-contract` type test that pins `agent.finished`
gains the fields, marked as added after the reference.

## Why

A parallel branch can fail while the run goes on: with `continueOnError` it gives `{ error }`, and
with `join: any` the state fails only when every branch has failed. Branches don't cancel each
other, so a `join: all` state fails once its last branch has ended, with the reason of the branch
that failed. Today only `run.failed` can say that something failed, so the log has no way to record
a failed branch, and folding the log again couldn't tell which branches are done. An optional field
on `agent.finished` closes the branch's timeline entry like any other answer, so the summary and
the timeline need no change. A new event type was the other option; it would need a new timeline
pairing and is a larger contract change for the same information. Older logs have no `error` and
read as agents that answered.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.agent-finished-error
- packages/core/events/src/run-event.test.ts

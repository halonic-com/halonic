# Decision: the child's context on `workflow.finished`

- Requirements: `events.workflow-finished-context` (`packages/core/events/requirements/workflow-finished-context.md`),
  `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`)
- Task: HAL-1537, step 5(c) of the HAL-186 plan (the `foreach` state)
- Approval: the plan on HAL-1537 asks for this field; the maintainer approves this note in review
- Kind: internal

## What changes

`workflow.finished` gains an optional `context`: the child run's final context. A for-each state
whose items run a workflow sets it on each item's `workflow.finished`, so the item's result is in
the parent's log and the engine can fold it. No event carried a child's context before; a
`workflow` state writes it with `context.updated`, but one `context.updated` per item would
overwrite the output key in the run summary with a single item's result.

`events.run-log-contract`: its third example listed "the thirteen fields that come with the engine".
It now lists fourteen, with `workflow.finished.context` and its requirement. No reference field
changes, and logs without `context` read as before.

## Tests

No test was weakened. The `workflow.finished` type test gains the optional field, marked as added
after the reference, and a new `events.workflow-finished-context` type test, in its own
`workflow-finished.test.ts`, checks an event with and without it.

## Covers

- events.run-log-contract
- events.workflow-finished-context
- packages/core/events/src/run-event.test.ts

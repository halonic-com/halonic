# events.workflow-finished-context

- Status: active
- Since: 0.1.0
- Source: HAL-1537, step 5(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan); "For-each" in docs/specs/workflow-semantics.md

The events package shall let a `workflow.finished` event carry the child run's final context in an optional `context`, so a for-each state whose items run a workflow keeps each item's result in its own log. A `workflow.finished` without `context`, as a `workflow` state writes it and as older logs have it, shall read as before.

## Examples

- Given a `workflow.finished` event of item 0 with `status: "completed"` and `context: { label: "refunds" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `workflow.finished` event without `context`,
  when its type is checked,
  then it is a valid run event.

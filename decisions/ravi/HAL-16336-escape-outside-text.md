# Decision: a workflow transition's event is an id

- Approval: HAL-16336 (Liam, CTO), the task asks for this change; Liam approves this note in review on HAL-16336
- Kind: user-visible

## What changes

- `format.workflow-event-id`: a transition's `event` in a workflow file must be an id (lowercase letters, digits, `-` and `_`, starting with a letter or digit), like the state names it points between. A file with any other event is refused at that event, with the id rule's message. The default `done` is unchanged.
- The published `workflow.schema.json` gives `event` the same `minLength` and `pattern` as every other id, so an editor flags such an event too.

## Why

A person types the event after `halonic runs send`, and the CLI prints it in the "Answer with:" line for them to copy. An id is safe to print and to paste into any shell as it is. Every event in the examples and the docs is already an id, and the engine's `after` timers don't use this field.

## Tests

`workflow.test.ts` checks that an event with a space is refused at `states.<state>.on.<n>.event` and that `needs_changes` is kept. One workflow test that needs an event outside the id rule now builds that workflow in code, where the engine still handles it. No test is weakened.

## Covers

- packages/core/format/spec/workflow.schema.json

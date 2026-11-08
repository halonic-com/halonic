# workflow.accepted-events

- Status: active
- Since: 0.1.0
- Source: `acceptedEvents` in the old workflow package (`packages/core/workflow/src/machine.ts`) at 784f78d

When a run waits in a state, the workflow rules shall list the events that state accepts, each once, in the order they first appear in the file, without its timer transitions.

## Examples

- Given a wait state with transitions on `approve`, `reject`, `approve` again and a timer, when its events are listed, then they are `approve` and `reject`.
- Given a final state, when its events are listed, then there are none.

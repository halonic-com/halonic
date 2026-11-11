# engine.initial-context-logged

- Status: active
- Since: 0.1.0
- Source: HAL-4752, the known gap `initial-context-unlogged` found by the parity run on HAL-1541

When a run starts, the engine shall record one `context.updated` for each key of the workflow's initial context, in the order the workflow lists them, after `run.started` and before the first `state.entered`, so a running or waiting run's state holds the initial context from the start. A run that can't be tried at all records none.

## Examples

- Given a workflow with the initial context `{ tone: "friendly" }`,
  when a run of it starts,
  then the engine records `run.started`, then `context.updated` with the key `tone` and the value "friendly", then `state.entered`.
- Given the approval workflow with the initial context `{ outcome: "pending" }`,
  when a run of it starts and waits in `decide`,
  then the waiting run's context is `{ outcome: "pending" }`.
- Given a workflow without an initial context,
  when a run of it starts,
  then the engine records no `context.updated` before the first `state.entered`.

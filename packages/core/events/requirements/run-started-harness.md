# events.run-started-harness

- Status: active
- Since: 0.1.0
- Source: HAL-189, step 6b (Liam's decision on HAL-3789)

The events package shall let a `run.started` event name, in an optional `harness`, the harness every task agent of the run runs in instead of the one its file names, such as `codex`, or `halonic` for Halonic's own loop, so a run started with `halonic run --harness` decides the same way when its log is read again. The override is a field of its own, not a key in the run's `input`, because the input reaches the agents' prompts. A `run.started` without `harness`, as a run that keeps each agent's own harness and older logs have it, shall read as before.

## Examples

- Given a `run.started` event with `harness: "codex"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event without `harness`,
  when its type is checked,
  then it is a valid run event.
